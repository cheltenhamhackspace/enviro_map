export async function onRequest(context) {
    //return new Response("Hello, world!")
    // If you did not use `DB` as your binding name, change it here
    const { results } = await context.env.READINGS_TABLE.prepare(
        "SELECT * FROM sensors"
    ).all();
    return Response.json(results);
}