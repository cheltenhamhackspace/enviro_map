export async function onRequest(context) {
    const { results } = await context.env.READINGS_TABLE.prepare(
        "SELECT name, device_id, lat, long FROM sensors"
    ).all();
    return Response.json(results);
}