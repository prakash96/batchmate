package com.batchmate.workflow.plugin.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.camel.Exchange;
import org.bouncycastle.bcpg.ArmoredOutputStream;
import org.bouncycastle.bcpg.CompressionAlgorithmTags;
import org.bouncycastle.bcpg.HashAlgorithmTags;
import org.bouncycastle.bcpg.SymmetricKeyAlgorithmTags;
import org.bouncycastle.openpgp.*;
import org.bouncycastle.openpgp.operator.bc.*;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Date;
import java.util.Iterator;

public class PgpHelper {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // Uses BC-native operators (Bc* classes) instead of JCE-wrapper operators (Jce* classes).
    // Jce* classes route through JCE provider lookup, which requires JAR signature verification
    // and fails when BC is loaded from a plugin URLClassLoader. Bc* classes bypass JCE entirely.

    // ── Public entry points ────────────────────────────────────────────────────

    public void encrypt(Exchange exchange) throws Exception {
        ObjectNode cfg = readConfig(exchange);

        String keyContent = resolveKey(exchange, cfg,
            cfg.path("keySource").asText("inline"),
            cfg.path("keyFile").asText(""),
            cfg.path("keyInline").asText(""),
            cfg.path("keyVar").asText(""));

        String userId  = cfg.path("userId").asText("").trim();
        boolean armor  = cfg.path("armor").asBoolean(true);
        int cipherAlg  = cipherAlg(cfg.path("cipher").asText("AES256"));
        int compAlg    = compAlg(cfg.path("compress").asText("ZIP"));

        boolean sign         = cfg.path("sign").asBoolean(false);
        String  sigKeySource = cfg.path("sigKeySource").asText("inline");
        String  sigKeyFile   = cfg.path("sigKeyFile").asText("").trim();
        String  sigKeyInline = cfg.path("sigKeyInline").asText("").trim();
        String  sigPass      = cfg.path("sigPass").asText("").trim();

        byte[] content = getContent(exchange, cfg);
        byte[] result;
        if (sign && (!sigKeyInline.isEmpty() || !sigKeyFile.isEmpty())) {
            String sigKey = resolveKey(exchange, cfg, sigKeySource, sigKeyFile, sigKeyInline, "");
            result = pgpEncryptAndSign(content,
                keyContent.getBytes(StandardCharsets.UTF_8), userId,
                sigKey.getBytes(StandardCharsets.UTF_8), sigPass,
                armor, cipherAlg, compAlg);
        } else {
            result = pgpEncrypt(content,
                keyContent.getBytes(StandardCharsets.UTF_8), userId,
                armor, cipherAlg, compAlg);
        }

        storeResult(exchange, result, cfg);
    }

    public void decrypt(Exchange exchange) throws Exception {
        ObjectNode cfg = readConfig(exchange);

        String keyContent = resolveKey(exchange, cfg,
            cfg.path("keySource").asText("inline"),
            cfg.path("keyFile").asText(""),
            cfg.path("keyInline").asText(""),
            cfg.path("keyVar").asText(""));

        String passphrase = cfg.path("passphrase").asText("").trim();

        byte[] content = getContent(exchange, cfg);
        byte[] result  = pgpDecrypt(content,
            keyContent.getBytes(StandardCharsets.UTF_8), passphrase);

        storeResult(exchange, result, cfg);
    }

    // ── PGP encrypt ───────────────────────────────────────────────────────────

    private byte[] pgpEncrypt(byte[] clearData, byte[] pubKeyBytes, String userId,
                              boolean armor, int cipherAlg, int compAlg) throws Exception {
        PGPPublicKey pubKey = findPublicKey(pubKeyBytes, userId.isEmpty() ? null : userId);

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        OutputStream out = armor ? new ArmoredOutputStream(baos) : baos;

        byte[] toEncrypt = wrapLiteralAndCompress(clearData, compAlg);

        PGPEncryptedDataGenerator encGen = new PGPEncryptedDataGenerator(
            new BcPGPDataEncryptorBuilder(cipherAlg)
                .setWithIntegrityPacket(true)
                .setSecureRandom(new SecureRandom()));
        encGen.addMethod(new BcPublicKeyKeyEncryptionMethodGenerator(pubKey));
        try (OutputStream encOut = encGen.open(out, toEncrypt.length)) {
            encOut.write(toEncrypt);
        }
        out.close();
        return baos.toByteArray();
    }

    private byte[] pgpEncryptAndSign(byte[] clearData, byte[] pubKeyBytes, String userId,
                                     byte[] privKeyBytes, String passphrase,
                                     boolean armor, int cipherAlg, int compAlg) throws Exception {
        PGPPublicKey pubKey  = findPublicKey(pubKeyBytes, userId.isEmpty() ? null : userId);
        PGPSecretKey secKey  = findSecretKey(privKeyBytes);
        PGPPrivateKey privKey = secKey.extractPrivateKey(
            new BcPBESecretKeyDecryptorBuilder(new BcPGPDigestCalculatorProvider())
                .build(passphrase.toCharArray()));

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        OutputStream out = armor ? new ArmoredOutputStream(baos) : baos;

        PGPEncryptedDataGenerator encGen = new PGPEncryptedDataGenerator(
            new BcPGPDataEncryptorBuilder(cipherAlg)
                .setWithIntegrityPacket(true)
                .setSecureRandom(new SecureRandom()));
        encGen.addMethod(new BcPublicKeyKeyEncryptionMethodGenerator(pubKey));

        PGPSignatureGenerator sigGen = new PGPSignatureGenerator(
            new BcPGPContentSignerBuilder(secKey.getPublicKey().getAlgorithm(), HashAlgorithmTags.SHA256));
        sigGen.init(PGPSignature.BINARY_DOCUMENT, privKey);

        ByteArrayOutputStream compBaos = new ByteArrayOutputStream();
        PGPCompressedDataGenerator compGen = new PGPCompressedDataGenerator(compAlg);
        try (OutputStream compOut = compGen.open(compBaos)) {
            sigGen.generateOnePassVersion(false).encode(compOut);
            PGPLiteralDataGenerator litGen = new PGPLiteralDataGenerator();
            try (OutputStream litOut = litGen.open(compOut, PGPLiteralData.BINARY,
                    PGPLiteralData.CONSOLE, clearData.length, new Date())) {
                litOut.write(clearData);
                sigGen.update(clearData);
            }
            sigGen.generate().encode(compOut);
        }
        byte[] compressedData = compBaos.toByteArray();

        try (OutputStream encOut = encGen.open(out, compressedData.length)) {
            encOut.write(compressedData);
        }
        out.close();
        return baos.toByteArray();
    }

    private byte[] wrapLiteralAndCompress(byte[] data, int compAlg) throws Exception {
        ByteArrayOutputStream litBaos = new ByteArrayOutputStream();
        PGPLiteralDataGenerator litGen = new PGPLiteralDataGenerator();
        try (OutputStream litOut = litGen.open(litBaos, PGPLiteralData.BINARY,
                PGPLiteralData.CONSOLE, data.length, new Date())) {
            litOut.write(data);
        }
        if (compAlg == CompressionAlgorithmTags.UNCOMPRESSED) return litBaos.toByteArray();

        ByteArrayOutputStream compBaos = new ByteArrayOutputStream();
        PGPCompressedDataGenerator compGen = new PGPCompressedDataGenerator(compAlg);
        try (OutputStream compOut = compGen.open(compBaos)) {
            compOut.write(litBaos.toByteArray());
        }
        return compBaos.toByteArray();
    }

    private PGPPublicKey findPublicKey(byte[] keyData, String userId) throws Exception {
        InputStream in = PGPUtil.getDecoderStream(new ByteArrayInputStream(keyData));
        PGPPublicKeyRingCollection rings = new PGPPublicKeyRingCollection(in,
            new BcKeyFingerprintCalculator());
        for (Iterator<PGPPublicKeyRing> ri = rings.getKeyRings(); ri.hasNext(); ) {
            for (Iterator<PGPPublicKey> ki = ri.next().getPublicKeys(); ki.hasNext(); ) {
                PGPPublicKey key = ki.next();
                if (!key.isEncryptionKey()) continue;
                if (userId == null) return key;
                for (Iterator<String> ui = key.getUserIDs(); ui.hasNext(); ) {
                    if (ui.next().contains(userId)) return key;
                }
            }
        }
        throw new IllegalArgumentException("No matching public encryption key found"
            + (userId != null ? " for userId: " + userId : ""));
    }

    // ── PGP decrypt ───────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private byte[] pgpDecrypt(byte[] encData, byte[] privKeyBytes, String passphrase) throws Exception {
        BcKeyFingerprintCalculator fpCalc = new BcKeyFingerprintCalculator();
        InputStream in = PGPUtil.getDecoderStream(new ByteArrayInputStream(encData));

        PGPObjectFactory factory = new PGPObjectFactory(in, fpCalc);

        // Scan forward through leading packets (e.g. PGPMarker, version headers)
        // until we find the PGPEncryptedDataList — usually the 1st or 2nd packet
        PGPEncryptedDataList encList = null;
        String firstPacketType = "none";
        for (int i = 0; i < 8; i++) {
            Object obj = factory.nextObject();
            if (obj == null) break;
            if (i == 0) firstPacketType = obj.getClass().getSimpleName();
            if (obj instanceof PGPEncryptedDataList) {
                encList = (PGPEncryptedDataList) obj;
                break;
            }
        }
        if (encList == null) {
            throw new IllegalStateException(
                "No PGPEncryptedDataList found — data may not be a PGP encrypted message " +
                "(first packet: " + firstPacketType + ")");
        }

        PGPSecretKeyRingCollection secRings = new PGPSecretKeyRingCollection(
            PGPUtil.getDecoderStream(new ByteArrayInputStream(privKeyBytes)), fpCalc);

        PGPPublicKeyEncryptedData pked   = null;
        PGPPrivateKey            privKey = null;
        for (Iterator<PGPEncryptedData> it = encList.getEncryptedDataObjects(); it.hasNext(); ) {
            PGPEncryptedData d = it.next();
            if (!(d instanceof PGPPublicKeyEncryptedData)) continue;
            PGPPublicKeyEncryptedData pkd = (PGPPublicKeyEncryptedData) d;
            PGPSecretKey sk = secRings.getSecretKey(pkd.getKeyID());
            if (sk != null) {
                privKey = sk.extractPrivateKey(
                    new BcPBESecretKeyDecryptorBuilder(new BcPGPDigestCalculatorProvider())
                        .build(passphrase.toCharArray()));
                pked = pkd;
                break;
            }
        }
        if (privKey == null) throw new IllegalStateException("No matching private key found to decrypt");

        InputStream clear = pked.getDataStream(new BcPublicKeyDataDecryptorFactory(privKey));

        PGPObjectFactory plainFactory = new PGPObjectFactory(clear, fpCalc);
        Object message = plainFactory.nextObject();
        if (message instanceof PGPCompressedData) {
            PGPCompressedData cd = (PGPCompressedData) message;
            plainFactory = new PGPObjectFactory(cd.getDataStream(), fpCalc);
            message = plainFactory.nextObject();
        }
        if (message instanceof PGPOnePassSignatureList) {
            message = plainFactory.nextObject();
        }
        if (message instanceof PGPLiteralData) {
            return ((PGPLiteralData) message).getInputStream().readAllBytes();
        }
        throw new IllegalStateException("Unexpected PGP message type: "
            + (message == null ? "null" : message.getClass().getSimpleName()));
    }

    private PGPSecretKey findSecretKey(byte[] keyData) throws Exception {
        InputStream in = PGPUtil.getDecoderStream(new ByteArrayInputStream(keyData));
        PGPSecretKeyRingCollection rings = new PGPSecretKeyRingCollection(in,
            new BcKeyFingerprintCalculator());
        for (Iterator<PGPSecretKeyRing> ri = rings.getKeyRings(); ri.hasNext(); ) {
            for (Iterator<PGPSecretKey> ki = ri.next().getSecretKeys(); ki.hasNext(); ) {
                PGPSecretKey key = ki.next();
                if (key.isSigningKey()) return key;
            }
        }
        throw new IllegalArgumentException("No signing key found in private key ring");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private ObjectNode readConfig(Exchange exchange) throws Exception {
        String raw = exchange.getProperty("_pgp_config", String.class);
        if (raw == null) throw new IllegalStateException("_pgp_config property not set");
        String json = new String(Base64.getDecoder().decode(raw), StandardCharsets.UTF_8);
        return (ObjectNode) MAPPER.readTree(json);
    }

    private String resolveKey(Exchange exchange, ObjectNode cfg, String source,
                              String file, String inline, String varName) throws Exception {
        switch (source) {
            case "file":
                return Files.readString(Paths.get(file));
            case "variable":
                Object val = exchange.getProperty(varName);
                return val != null ? val.toString() : "";
            default:
                return inline;
        }
    }

    private byte[] getContent(Exchange exchange, ObjectNode cfg) {
        String contentSource = cfg.path("contentSource").asText("body");
        String contentVar    = cfg.path("contentVar").asText("").trim();

        if ("variable".equals(contentSource) && !contentVar.isEmpty()) {
            Object var = exchange.getProperty(contentVar);
            if (var == null) return new byte[0];
            if (var instanceof byte[]) return (byte[]) var;
            if (var instanceof String) return ((String) var).getBytes(StandardCharsets.UTF_8);
            return var.toString().getBytes(StandardCharsets.UTF_8);
        }

        // Use Camel's type-converter chain: getBody(byte[].class) handles
        // GenericFile (via GenericFileConverter), InputStream, String, and byte[]
        // without needing any custom body-unwrap code here.
        byte[] bytes = exchange.getMessage().getBody(byte[].class);
        return bytes != null ? bytes : new byte[0];
    }

    private void storeResult(Exchange exchange, byte[] result, ObjectNode cfg) {
        String  resultVar = cfg.path("resultVar").asText("").trim();
        boolean setAsBody = cfg.path("setAsBody").asBoolean(true);
        if (!resultVar.isEmpty()) exchange.setProperty(resultVar, result);
        if (setAsBody) exchange.getMessage().setBody(result);
    }

    private int cipherAlg(String name) {
        switch (name) {
            case "AES192":      return SymmetricKeyAlgorithmTags.AES_192;
            case "AES128":      return SymmetricKeyAlgorithmTags.AES_128;
            case "CAMELLIA256": return SymmetricKeyAlgorithmTags.CAMELLIA_256;
            case "3DES":        return SymmetricKeyAlgorithmTags.TRIPLE_DES;
            case "BLOWFISH":    return SymmetricKeyAlgorithmTags.BLOWFISH;
            default:            return SymmetricKeyAlgorithmTags.AES_256;
        }
    }

    private int compAlg(String name) {
        switch (name) {
            case "ZLIB":         return CompressionAlgorithmTags.ZLIB;
            case "BZIP2":        return CompressionAlgorithmTags.BZIP2;
            case "UNCOMPRESSED": return CompressionAlgorithmTags.UNCOMPRESSED;
            default:             return CompressionAlgorithmTags.ZIP;
        }
    }
}
