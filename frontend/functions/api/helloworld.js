export async function onRequest(context) {
    //return new Response("Hello, world!")
    // If you did not use `DB` as your binding name, change it here
    const { results } = await env.DB.prepare(
        "SELECT * FROM Customers WHERE CompanyName = ?"
    )
        .bind("Bs Beverages")
        .all();
    return Response.json(results);
}