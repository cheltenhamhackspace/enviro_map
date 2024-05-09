export async function onRequest(context) {
    const allSensors = await context.env.READINGS_TABLE.prepare(
        "SELECT name, device_id, lat, long FROM sensors"
    ).all();

    const latestReadings = await context.env.READINGS_TABLE.prepare(
        "SELECT device_id, voc, MAX(event_time) FROM sensor_readings GROUP BY device_id"
    ).all();

    console.log(latestReadings);

    latestReadings.forEach(function (arrayItem) {
        let index = allSensors.findIndex(x => x.device_id === arrayItem.device_id);
        console.log(index);
        allSensors[index].pm2_5 = arrayItem.pm2_5;
    });

    return Response.json(results);
}