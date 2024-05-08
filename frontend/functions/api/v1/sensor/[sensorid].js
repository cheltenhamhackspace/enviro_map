export async function onRequest(context) {
    if (context.request.method === "POST") {
        console.log(context);
        console.log(JSON.stringify(await context.json()));
        return new Response(context.params.sensorid);
    }
    else if (context.request.method === "GET") {
        return new Response("The request was a GET");
    }
}