export async function onRequest(context) {
    if (request.method === "POST") {
        return new Response(context.params.sensorid);
    }
    else if (request.method === "GET") {
        return new Response("The request was a GET");
    }
}