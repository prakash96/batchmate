import { BASE_URL } from "../config";
import { evalTemplate as applyVariables } from "../engine/expression/simple";

//  Resolve variables in URL
export async  function executeHttpRequest(config, context) {
    const resolvedUrl = applyVariables(config.url, context);

    const headers = Object.fromEntries(
        Object.entries(config.headers || {}).map(([k, v]) => [
            k,
            typeof v === "string" ? applyVariables(v, context) : v
        ])
    );

    //  Prepare body
    let reqBody = config.body;
    if (reqBody && typeof (reqBody) == Object) {
        reqBody = Object.fromEntries(
            Object.entries(config.body || {}).map(([k, v]) => [
                k,
                typeof v === "string" ? applyVariables(v, context) : v
            ]))
    }else{

       reqBody = reqBody? applyVariables(reqBody, context): null; 
    }

    let response = {};
    let body = {}

    response = await callProxy({
        "method": config.method,
        "url": resolvedUrl,
        "headers": headers,
        "body": ["GET", "HEAD"].includes(config.method) ? null : (config.headers?.["Content-Type"]?.includes("application/x-www-form-urlencoded") && typeof reqBody === "object") ? new URLSearchParams(reqBody).toString() : reqBody
    });
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
        body = await response.json();
    } else if (contentType.includes("xml")) {
        const xmlText = await response.text();
        const parser = new DOMParser();
        body = parser.parseFromString(xmlText, "application/xml");
    } else if (contentType.includes("text")) {
        body = await response.text();
    } else {
        body = await response.blob(); // for binary (file, image, etc.)
    }

    let respHeaders = {};
    if (response.headers) {
        respHeaders = Object.fromEntries(response.headers.entries());
        respHeaders["statusCode"] = response.status;
    }

    return {
        respBody: body,
        respHeaders: respHeaders
    }
}   

async function callProxy(req) {
    const res = await fetch(BASE_URL + "/execute", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(req)
    });

    return await res;
}

