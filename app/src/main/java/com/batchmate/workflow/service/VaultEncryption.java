package com.batchmate.workflow.service;

import javax.crypto.*;
import javax.crypto.spec.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * AES-256-GCM encryption for vault config blobs.
 *
 * Key resolution order:
 *   1. VAULT_MASTER_KEY environment variable (64 hex chars = 32 bytes)
 *   2. Key file at {metadata}/.vault.key  (auto-generated on first run)
 *
 * Encrypted values are prefixed with "enc:" so plain-text entries
 * written before this change continue to be read without error (migration-safe).
 */
class VaultEncryption {

    private static final String ALGO   = "AES/GCM/NoPadding";
    private static final int    IV_LEN = 12;   // 96-bit IV recommended for GCM
    private static final int    TAG_BITS = 128;

    // ── Key loading ───────────────────────────────────────────────────────────

    static SecretKey loadOrGenerateKey(Path keyFile) throws Exception {
        String envKey = System.getenv("VAULT_MASTER_KEY");
        if (envKey != null && !envKey.isBlank()) {
            byte[] raw = fromHex(envKey.trim());
            if (raw.length != 32) throw new IllegalArgumentException(
                "VAULT_MASTER_KEY must be 64 hex chars (32 bytes / 256 bits)");
            return new SecretKeySpec(raw, "AES");
        }

        if (Files.exists(keyFile)) {
            byte[] raw = Base64.getDecoder().decode(Files.readString(keyFile).trim());
            return new SecretKeySpec(raw, "AES");
        }

        // Auto-generate a new 256-bit key and persist it
        KeyGenerator kg = KeyGenerator.getInstance("AES");
        kg.init(256, new SecureRandom());
        SecretKey key = kg.generateKey();
        Files.createDirectories(keyFile.getParent());
        Files.writeString(keyFile, Base64.getEncoder().encodeToString(key.getEncoded()));
        return key;
    }

    // ── Encrypt / decrypt ─────────────────────────────────────────────────────

    static String encrypt(String plaintext, SecretKey key) throws Exception {
        byte[] iv = new byte[IV_LEN];
        new SecureRandom().nextBytes(iv);

        Cipher cipher = Cipher.getInstance(ALGO);
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
        byte[] ciphertext = cipher.doFinal(plaintext.getBytes("UTF-8"));

        // Format: "enc:" + base64(iv || ciphertext+tag)
        byte[] combined = new byte[IV_LEN + ciphertext.length];
        System.arraycopy(iv,         0, combined, 0,      IV_LEN);
        System.arraycopy(ciphertext, 0, combined, IV_LEN, ciphertext.length);
        return "enc:" + Base64.getEncoder().encodeToString(combined);
    }

    static String decrypt(String encoded, SecretKey key) throws Exception {
        byte[] combined = Base64.getDecoder().decode(encoded.substring(4)); // strip "enc:"
        byte[] iv         = new byte[IV_LEN];
        byte[] ciphertext = new byte[combined.length - IV_LEN];
        System.arraycopy(combined, 0,      iv,         0, IV_LEN);
        System.arraycopy(combined, IV_LEN, ciphertext, 0, ciphertext.length);

        Cipher cipher = Cipher.getInstance(ALGO);
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
        return new String(cipher.doFinal(ciphertext), "UTF-8");
    }

    static boolean isEncrypted(String value) {
        return value != null && value.startsWith("enc:");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static byte[] fromHex(String hex) {
        if (hex.length() % 2 != 0)
            throw new IllegalArgumentException("Hex string must have even length");
        byte[] bytes = new byte[hex.length() / 2];
        for (int i = 0; i < bytes.length; i++)
            bytes[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        return bytes;
    }
}
