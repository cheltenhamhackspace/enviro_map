export async function onRequest(context) {
    const allSensors = await context.env.READINGS_TABLE.prepare(
        "SELECT name, device_id, lat, long FROM sensors"
    ).all();

    const allSensorIds = allSensors.results.map(a => a.device_id);
    console.log(allSensorIds);

    const dbQueryLatestReadings = await context.env.READINGS_TABLE.prepare(
        "SELECT device_id, pm2_5, nox, voc, MAX(event_time) FROM sensor_readings WHERE device_id = ?"
    )

    console.log(allSensors);



    latestReadings.results.forEach(async function (arrayItem) {
        const latestReading = await dbQueryLatestReadings.bind(arrayItem.device_id).all();
        console.log(latestReading);
        if (latestReading.results.length == 1) {
            console.log(arrayItem);
            allSensors.results[index]["pm2_5"] = latestReading.results[0].pm2_5;
            allSensors.results[index]["nox"] = latestReading.results[0].nox;
            allSensors.results[index]["voc"] = latestReading.results[0].voc;
        }
    });

    return Response.json(allSensors.results);
}