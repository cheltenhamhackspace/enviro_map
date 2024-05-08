export async function onRequest(context) {
    return Response(context.params.user);
}