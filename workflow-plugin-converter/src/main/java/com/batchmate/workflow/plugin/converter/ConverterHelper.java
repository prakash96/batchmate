package com.batchmate.workflow.plugin.converter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.xml.XmlMapper;
import org.apache.camel.Exchange;

public class ConverterHelper {

    private final ObjectMapper jsonMapper = new ObjectMapper();
    private final XmlMapper    xmlMapper  = new XmlMapper();

    public void xmlToJson(Exchange exchange) throws Exception {
        String resultVar = prop(exchange, "_op_var",     "");
        String onError   = prop(exchange, "_op_onError", "stop");
        String xml = exchange.getMessage().getBody(String.class);
        try {
            Object obj  = xmlMapper.readValue(xml, Object.class);
            String json = jsonMapper.writeValueAsString(obj);
            exchange.getMessage().setBody(json);
            if (!resultVar.isEmpty()) exchange.setProperty(resultVar, json);
        } catch (Exception e) {
            if ("stop".equals(onError)) throw e;
        }
    }

    public void jsonToXml(Exchange exchange) throws Exception {
        String resultVar   = prop(exchange, "_op_var",     "");
        String rootElement = prop(exchange, "_op_root",    "root");
        String onError     = prop(exchange, "_op_onError", "stop");
        String json = exchange.getMessage().getBody(String.class);
        try {
            Object obj = jsonMapper.readValue(json, Object.class);
            String xml = xmlMapper.writer().withRootName(rootElement).writeValueAsString(obj);
            exchange.getMessage().setBody(xml);
            if (!resultVar.isEmpty()) exchange.setProperty(resultVar, xml);
        } catch (Exception e) {
            if ("stop".equals(onError)) throw e;
        }
    }

    private static String prop(Exchange exchange, String key, String defaultVal) {
        Object v = exchange.getProperty(key);
        return v != null ? v.toString() : defaultVal;
    }
}
