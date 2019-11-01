import { Request, Response, Router, response } from "express";
import { RouteFactory, MiniIotConfig, CSVDescriptor, CSVColumnDescriptor } from "../main-api";
import * as fs from "fs";

// https://grafana.com/grafana/plugins/grafana-simple-json-datasource

// I used this for copy and paste: https://github.com/bergquist/fake-simple-json-datasource/blob/master/index.js

const setCORSHeaders = (res: Response) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST");
    res.setHeader("Access-Control-Allow-Headers", "accept, content-type");
};

const getCSVDescriptor = (filePath: string) => {
    // if there is no descriptor, create one. easier to edit later on
    const descrPath = filePath + ".descr.json";
    if (fs.existsSync(descrPath)) {
        const descr = JSON.parse(fs.readFileSync(descrPath, { encoding: "UTF-8" })) as CSVDescriptor;
        return descr;
    } else {
        const data = fs.readFileSync(filePath, { encoding: "UTF-8" });
        const numColumns = data.split("\n")[0].split(",").length;
        if (numColumns) {
            const descr: CSVDescriptor = {
                columns: []
            };
            for (let i = 0; i < numColumns; i++) {
                const dummyName = i == 0 ? "Timestamp" : "Column " + i;
                descr.columns.push({ index: i, name: dummyName });
            }
            fs.writeFileSync(descrPath, JSON.stringify(descr));

            return descr;
        } else {
            throw new Error("File not found: " + filePath);
        }
    }
}

const getCSV = (filePath: string) => {
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, { encoding: "UTF-8" });
        const result = data
            .split("\n") // get lines
            .filter(line => line.length > 0) // non empty lines
            .map(line => line.split(",").map(entry => {
                const num = parseFloat(entry);
                const value = isNaN(num) ? 0 : num;
                console.log(entry, "=>", value);
                return value;
            })); // map line to column
        return result;
    } else {
        throw new Error("File not found: " + filePath);
    }
}

const createDataPointMap = (descr: CSVDescriptor, data: number[][]) => {
    const dataPoints: GrafanaDataPointMap = {};
    descr.columns.forEach(col => {
        if (col.index !== 0) {
            dataPoints[col.index] = [];
        }
    });
    // collect data for each column
    data.forEach(row => {
        descr.columns.forEach(col => {
            if (col.index !== 0) {
                // [value, timestamp]
                dataPoints[col.index].push([row[col.index], row[0]]);
            }
        });
    });
    return dataPoints;
}

type GrafanaDataPoint = [number, number]; // float , timestamp

interface GrafanaDataPointMap {
    [index: number]: GrafanaDataPoint[]
}

interface GrafanaTimeserie {
    target: string;
    datapoints: GrafanaDataPoint[];
}

type GrafanaTimeserieResponse = GrafanaTimeserie[];

interface GrafanaColumn {
    text: string,
    type: "time" | "string" | "number"
}



type GrafanaRow = (number | string)[];

interface GrafanaTable {
    columns: GrafanaColumn[],
    "rows": GrafanaRow[],
    "type": "table"
}
type GrafanaTableResponse = GrafanaTable[];

export const CsvToGrafanaRoute: RouteFactory = {

    register: (config: MiniIotConfig, router: Router) => {

        router.all("/csv2grafana/:uuid/:file/", (req: Request, res: Response) => {
            setCORSHeaders(res);
            console.log(req.url);
            console.log(req.body);

            // / should return 200 ok. Used for "Test connection" on the datasource config page.
            if (!req.params.file.endsWith(".csv")) {
                res.status(400).end();
            }

            const filePath = config.dataDir + "/" + req.params.uuid + "/" + req.params.file;

            if (!fs.existsSync(filePath)) {
                res.status(404).end();
            }

            const data = fs.readFileSync(filePath, { encoding: "UTF-8" });
            // rule: first column is timestamp!

            res.status(200).end();
        });

        router.all("/csv2grafana/:uuid/:file/search", (req: Request, res: Response) => {
            setCORSHeaders(res);
            console.log(req.url);
            console.log(req.body);

            // return a result of targets
            const filePath = config.dataDir + "/" + req.params.uuid + "/" + req.params.file;
            const descr = getCSVDescriptor(filePath);

            if (descr) {
                const result: string[] = [];

                descr.columns.sort((a: CSVColumnDescriptor, b: CSVColumnDescriptor) => a.index < b.index ? -1 : a.index == b.index ? 0 : 1);
                // don't return first column (timestamp)
                descr.columns.filter(c => c.index !== 0).forEach(c => result.push(c.name));

                res.json(result);
                res.end();
            } else {
                res.status(404).end();
            }
        });

        router.all("/csv2grafana/:uuid/:file/annotations", (req: Request, res: Response) => {
            setCORSHeaders(res);
            console.log(req.url);
            console.log(req.body);

            // TODO: check for an annotations file, if missing create an empty so we know how to fill it manually.

            res.json([]);
            res.end();
        });

        router.all("/csv2grafana/:uuid/:file/query", (req: Request, res: Response) => {
            setCORSHeaders(res);
            console.log(req.url);
            console.log(req.body);

            const filePath = config.dataDir + "/" + req.params.uuid + "/" + req.params.file;

            var tsResult: GrafanaTableResponse | GrafanaTimeserieResponse = [];

            const exmpleQuery = { // TODO: remove
                requestId: 'Q102',
                timezone: '',
                panelId: 2,
                dashboardId: null,
                range: {
                    from: '2019-11-01T06:57:44.819Z',
                    to: '2019-11-01T12:57:44.819Z',
                    raw: { from: 'now-6h', to: 'now' }
                },
                interval: '20s',
                intervalMs: 20000,
                targets: [{ target: 'Sinus', refId: 'A', type: 'timeserie' }],
                maxDataPoints: 936,
                scopedVars: {
                    __interval: { text: '20s', value: '20s' },
                    __interval_ms: { text: '20000', value: 20000 }
                },
                startTime: 1572613064822,
                rangeRaw: { from: 'now-6h', to: 'now' },
                adhocFilters: []
            };

            if (req.body.adhocFilters && req.body.adhocFilters.length > 0) {
                // TODO: use filters
            }

            if (req.body.targets && req.body.targets.length) {
                const result: any = [];
                const data = getCSV(filePath);
                const descr = getCSVDescriptor(filePath);
                const dataPoints = createDataPointMap(descr, data);

                req.body.targets.forEach((target: any) => {

                    if (target.type === "timeserie") {
                        const targetColumn = descr.columns.find(col => col.name === target.target);
                        if (targetColumn && targetColumn.index !== 0) {
                            const timeserie: GrafanaTimeserie = {
                                target: targetColumn.name,
                                datapoints: dataPoints[targetColumn.index]
                            };
                            result.push(timeserie);
                        }
                    }
                    else if (target.type === "table") {
                        // TODO
                    }
                });

                res.json(result).end();
            }
            res.status(404).send().end();
        });

        router.all('/tag[\-]keys', (req: Request, res: Response) => {
            setCORSHeaders(res);
            console.log(req.url);
            console.log(req.body);

            res.json([]);
            res.end();
        });

        router.all('/tag[\-]values', (req: Request, res: Response) => {
            setCORSHeaders(res);
            console.log(req.url);
            console.log(req.body);

            res.json([]);
            res.end();
        });
    }

}