export async function onRequest(context) {
    /**
     * readRequestBody reads in the incoming request body
     * Use await readRequestBody(..) in an async function to get the string
     * @param {Request} request the incoming request to read from
     */
    async function readRequestBody(request) {
        const contentType = request.headers.get("content-type");
        if (contentType.includes("application/json")) {
            return JSON.stringify(await request.json());
        } else if (contentType.includes("application/text")) {
            return request.text();
        } else if (contentType.includes("text/html")) {
            return request.text();
        } else if (contentType.includes("form")) {
            const formData = await request.formData();
            const body = {};
            for (const entry of formData.entries()) {
                body[entry[0]] = entry[1];
            }
            return JSON.stringify(body);
        } else {
            // Perhaps some other type of data was submitted in the form
            // like an image, or some other binary data.
            return "a file";
        }
    }

    async function standardiseReadingData(readingData) {
        function checkUndefinedSetNull(item) {
            if (readingData[item] === undefined || readingData[item] === "inf" || readingData[item] === "nan") {
                readingData[item] = null;
            };
        }
        const keys = ["relative_humidity", "temperature", "pm1", "pm2_5", "pm4", "pm10", "voc", "nox", "version", "uptime", "sensor_connected"];
        keys.forEach(checkUndefinedSetNull);
    }

    if (context.request.method === "POST") {
        let reqBody = await readRequestBody(context.request);
        let data = JSON.parse(reqBody);
        console.log(context.params.sensorid);
        console.log(data);

        if (data.pm1) {
            standardiseReadingData(data);
            console.log(data);
            const { success } = await context.env.READINGS_TABLE.prepare(`
                insert into sensor_readings ( device_id, event_time, relative_humidity, temperature, pm1, pm2_5, pm4, pm10, voc, nox, uptime, version) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(context.params.sensorid, Date.now(), data.relative_humidity, data.temperature, data.pm1, data.pm2_5, data.pm4, data.pm10, data.voc, data.nox, data.uptime, data.version).run()
            return new Response("201 - Indexed", { status: 201 });
        }

        else {
            return new Response("500 - Bad data", { status: 500 });
        }


    }
    else if (context.request.method === "GET") {
        const urlParams = new URL(context.request.url).searchParams;

        let timeFrom = urlParams.get("from");
        let timeTo = urlParams.get("to");

        console.log(`From: ${timeFrom}, To: ${timeTo}`);

        // ensure time fields are always present
        if (timeFrom === null) {
            timeFrom = Date.now() - 86400000;
        }
        if (timeTo === null) {
            timeTo = Date.now();
        }
        if (timeFrom > timeTo) {
            return new Response("500 - Times in wrong order", { status: 500 });
        }
        else {
            const dbQueryAllData = context.env.READINGS_TABLE.prepare('SELECT event_time, relative_humidity, temperature, pm1, pm2_5, pm4, pm10, voc, nox FROM sensor_readings WHERE device_id = ?1 AND event_time >= ?2 AND event_time <= ?3');
            const allData = await dbQueryAllData.bind(context.params.sensorid, timeFrom, timeTo).all();

            console.log(allData.meta);
            if (allData.results.length > 0) {
                return new Response(JSON.stringify(allData.results));
            }
            else {
                return new Response("404 - No data", { status: 404 });
            }
        }
    }
}