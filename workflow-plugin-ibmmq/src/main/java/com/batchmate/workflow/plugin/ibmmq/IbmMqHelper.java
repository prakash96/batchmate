package com.batchmate.workflow.plugin.ibmmq;

import com.ibm.mq.MQException;
import com.ibm.mq.MQGetMessageOptions;
import com.ibm.mq.MQMessage;
import com.ibm.mq.MQPutMessageOptions;
import com.ibm.mq.MQQueue;
import com.ibm.mq.MQQueueManager;
import com.ibm.mq.MQTopic;
import com.ibm.mq.constants.CMQC;
import org.apache.camel.Exchange;

import java.nio.charset.StandardCharsets;
import java.util.Hashtable;

public class IbmMqHelper {

    public void publish(Exchange exchange) throws Exception {
        String host         = exchange.getProperty("_op_host", String.class);
        int    port         = Integer.parseInt(exchange.getProperty("_op_port", "1414", String.class));
        String channel      = exchange.getProperty("_op_channel", String.class);
        String queueManager = exchange.getProperty("_op_queueManager", String.class);
        String username     = exchange.getProperty("_op_username", "", String.class);
        String password     = exchange.getProperty("_op_password", "", String.class);
        String destType     = exchange.getProperty("_op_destType", "QUEUE", String.class);
        String destName     = exchange.getProperty("_op_destName", String.class);
        boolean persistent  = Boolean.parseBoolean(exchange.getProperty("_op_persistent", "true", String.class));
        int expirySec       = Integer.parseInt(exchange.getProperty("_op_expiry", "0", String.class));
        int priority        = Integer.parseInt(exchange.getProperty("_op_priority", "-1", String.class));
        String corrId       = exchange.getProperty("_op_correlationId", "", String.class);
        String resultVar    = exchange.getProperty("_op_var", "", String.class);

        byte[] body = exchange.getIn().getBody(byte[].class);
        if (body == null) {
            String s = exchange.getIn().getBody(String.class);
            body = s != null ? s.getBytes(StandardCharsets.UTF_8) : new byte[0];
        }

        MQQueueManager qmgr = new MQQueueManager(queueManager, buildProps(host, port, channel, username, password));
        try {
            MQMessage msg = new MQMessage();
            msg.persistence = persistent ? 1 : 0; // MQPER_PERSISTENT=1, MQPER_NOT_PERSISTENT=0
            if (expirySec > 0) msg.expiry = expirySec * 10; // tenths of a second
            if (priority >= 0) msg.priority = priority;
            if (!corrId.isEmpty()) msg.correlationId = toPaddedBytes(corrId, 24);
            msg.write(body);

            MQPutMessageOptions pmo = new MQPutMessageOptions();
            if ("TOPIC".equalsIgnoreCase(destType)) {
                MQTopic topic = qmgr.accessTopic(destName, null, CMQC.MQTOPIC_OPEN_AS_PUBLICATION, CMQC.MQOO_FAIL_IF_QUIESCING);
                try {
                    topic.put(msg, pmo);
                } finally {
                    topic.close();
                }
            } else {
                int openOpts = 16 | CMQC.MQOO_FAIL_IF_QUIESCING; // 16 = MQOO_OUTPUT
                MQQueue queue = qmgr.accessQueue(destName, openOpts);
                try {
                    queue.put(msg, pmo);
                } finally {
                    queue.close();
                }
            }

            String msgId = bytesToHex(msg.messageId);
            exchange.getMessage().setHeader("MQMessageId", msgId);
            if (!resultVar.isEmpty()) {
                exchange.setProperty(resultVar, msgId);
                exchange.getMessage().setHeader(resultVar, msgId);
            }
        } finally {
            try { qmgr.disconnect(); } catch (MQException ignored) {}
        }
    }

    public void consume(Exchange exchange) throws Exception {
        String host         = exchange.getProperty("_op_host", String.class);
        int    port         = Integer.parseInt(exchange.getProperty("_op_port", "1414", String.class));
        String channel      = exchange.getProperty("_op_channel", String.class);
        String queueManager = exchange.getProperty("_op_queueManager", String.class);
        String username     = exchange.getProperty("_op_username", "", String.class);
        String password     = exchange.getProperty("_op_password", "", String.class);
        String destName     = exchange.getProperty("_op_destName", String.class);
        int waitSec         = Integer.parseInt(exchange.getProperty("_op_waitInterval", "0", String.class));
        String corrId       = exchange.getProperty("_op_correlationId", "", String.class);
        String resultVar    = exchange.getProperty("_op_var", "", String.class);

        MQQueueManager qmgr = new MQQueueManager(queueManager, buildProps(host, port, channel, username, password));
        try {
            int openOpts = CMQC.MQOO_INPUT_AS_Q_DEF | CMQC.MQOO_FAIL_IF_QUIESCING;
            MQQueue queue = qmgr.accessQueue(destName, openOpts);
            try {
                MQMessage msg = new MQMessage();
                MQGetMessageOptions gmo = new MQGetMessageOptions();
                if (waitSec > 0) {
                    gmo.options = 1 | CMQC.MQGMO_FAIL_IF_QUIESCING; // 1 = MQGMO_WAIT
                    gmo.waitInterval = waitSec * 1000;
                } else {
                    gmo.options = CMQC.MQGMO_NO_WAIT | CMQC.MQGMO_FAIL_IF_QUIESCING;
                }
                if (!corrId.isEmpty()) {
                    msg.correlationId = toPaddedBytes(corrId, 24);
                    gmo.matchOptions = 2; // MQMO_MATCH_CORREL_ID
                }

                try {
                    queue.get(msg, gmo);
                    int len = msg.getDataLength();
                    byte[] data = new byte[len];
                    msg.readFully(data);
                    String body = new String(data, StandardCharsets.UTF_8);
                    exchange.getMessage().setBody(body);
                    exchange.getMessage().setHeader("MQMessageId", bytesToHex(msg.messageId));
                    exchange.getMessage().setHeader("MQCorrelationId", bytesToHex(msg.correlationId));
                    if (!resultVar.isEmpty()) {
                        exchange.setProperty(resultVar, body);
                        exchange.getMessage().setHeader(resultVar, body);
                    }
                } catch (MQException mqe) {
                    if (mqe.reasonCode == CMQC.MQRC_NO_MSG_AVAILABLE) {
                        exchange.getMessage().setBody(null);
                        exchange.getMessage().setHeader("MQNoMessage", "true");
                    } else {
                        throw mqe;
                    }
                }
            } finally {
                try { queue.close(); } catch (MQException ignored) {}
            }
        } finally {
            try { qmgr.disconnect(); } catch (MQException ignored) {}
        }
    }

    private static Hashtable<String, Object> buildProps(String host, int port, String channel, String username, String password) {
        Hashtable<String, Object> props = new Hashtable<>();
        props.put("hostname", host);
        props.put("port", port);
        props.put("channel", channel);
        props.put("transportType", 1); // TRANSPORT_MQSERIES_CLIENT
        if (username != null && !username.isEmpty()) props.put("userID", username);
        if (password != null && !password.isEmpty()) props.put("password", password);
        return props;
    }

    private static byte[] toPaddedBytes(String s, int length) {
        byte[] src = s.getBytes(StandardCharsets.UTF_8);
        byte[] out = new byte[length];
        System.arraycopy(src, 0, out, 0, Math.min(src.length, length));
        return out;
    }

    private static String bytesToHex(byte[] bytes) {
        if (bytes == null) return "";
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02X", b));
        return sb.toString();
    }
}
