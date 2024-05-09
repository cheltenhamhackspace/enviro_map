export async function onRequest(context) {
    const allSensors = await context.env.READINGS_TABLE.prepare(
        "SELECT name, device_id, lat, long FROM sensors"
    ).all();

    const latestReadings = await context.env.READINGS_TABLE.prepare(
        "SELECT device_id, pm2_5, nox, voc, MAX(event_time) FROM sensor_readings GROUP BY device_id"
    ).all();

    console.log(allSensors);
    console.log(latestReadings);



    latestReadings.results.forEach(function (arrayItem) {
        let index = allSensors.results.findIndex(x => x.device_id === arrayItem.device_id);
        console.log(index);
        if (index >= 0) {
            console.log(arrayItem);
            allSensors.results[index]["pm2_5"] = arrayItem.pm2_5;
            allSensors.results[index]["nox"] = arrayItem.nox;
            allSensors.results[index]["voc"] = arrayItem.voc;
        }
    });

    return Response.json(allSensors.results);
}