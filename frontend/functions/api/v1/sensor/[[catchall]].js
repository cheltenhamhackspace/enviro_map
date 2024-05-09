export async function onRequest(context) {

    if (context.params.catchall.length === 2 && context.params.catchall[1] === "latest") {
        const latestReading = await context.env.READINGS_TABLE.prepare(
            "SELECT device_id, pm2_5, nox, voc, MAX(event_time) FROM sensor_readings WHERE device_id = ?"
        ).bind(context.params.catchall[0]).all();
        console.log(latestReading);

        if (latestReading.results.length == 1) {
            return Response.json(latestReading.results);
        }
        else {
            return new Response("404 - No data", { status: 404 });
        }
    }
    else {
        return new Response("404 - No function", { status: 404 });
    }

}