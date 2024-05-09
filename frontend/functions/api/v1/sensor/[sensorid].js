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
            if (readingData[item] === undefined) {
                readingData[item] = null;
            };
        }
        const keys = ["relative_humidity", "temperature", "pm1", "pm2_5", "pm4", "pm10", "voc", "nox"];
        keys.forEach(checkUndefinedSetNull);
    }

    if (context.request.method === "POST") {
        const reqBody = await readRequestBody(context.request);
        const data = JSON.parse(reqBody);
        console.log(data);

        if (data.pm1) {
            standardiseReadingData(data);
            console.log(data);
            const { success } = await context.env.READINGS_TABLE.prepare(`
                insert into sensor_readings ( device_id, event_time, relative_humidity, temperature, pm1, pm2_5, pm4, pm10, voc, nox) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(context.params.sensorid, Date.now(), data.relative_humidity, data.temperature, data.pm1, data.pm2_5, data.pm4, data.pm10, data.voc, data.nox).run()
            return new Response("Indexed", { status: 201 });
        }

        else {
            return new Response("Bad data", { status: 500 });
        }


    }
    else if (context.request.method === "GET") {
        return new Response("The request was a GET");
    }
}