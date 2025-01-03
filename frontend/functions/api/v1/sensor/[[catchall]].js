export async function onRequest(context) {

    if (context.params.catchall.length === 2 && context.params.catchall[1] === "latest") {
        const latestReading = await context.env.READINGS_TABLE.prepare(
            "SELECT pm1, pm2_5, pm4, pm10, temperature, relative_humidity, nox, voc, MAX(event_time) AS time FROM sensor_readings WHERE device_id = ?"
        ).bind(context.params.catchall[0]).all();
        console.log(latestReading);

        if (latestReading.results.length == 1 && latestReading.results[0]["time"] !== null) {
            return Response.json(latestReading.results[0]);
        }
        else {
            return new Response("404 - No data", { status: 404 });
        }
    }
    else {
        return new Response("404 - No function", { status: 404 });
    }

}