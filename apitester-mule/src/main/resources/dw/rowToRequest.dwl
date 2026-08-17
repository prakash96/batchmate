%dw 2.0

/**
 * Converts one `requests` table row (JSON columns as text) into the nested request object shape
 * apitester-ui expects — the same shape apitester-app's request.json files already have.
 */
fun rowToRequest(r) = {
    id: r.id,
    collectionId: r.collection_id,
    name: r.name,
    description: r.description default "",
    preRequest: read(r.pre_request_json default "[]", "application/json"),
    request: read(r.request_json default "{}", "application/json"),
    postResponse: read(r.post_response_json default "[]", "application/json"),
    inputDataSets: read(r.input_data_sets_json default "[]", "application/json")
}
