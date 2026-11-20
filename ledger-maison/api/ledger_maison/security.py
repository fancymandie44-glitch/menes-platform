from __future__ import annotations

import os
import secrets
from pathlib import Path

from argon2 import PasswordHasher
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ph = PasswordHasher(time_cost=3, memory_cost=64 * 1024, parallelism=2)


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    try:
        return ph.verify(encoded, password)
    except Exception:
        return False


def derive_file_key(password: str, salt: bytes) -> bytes:
    from argon2.low_level import Type, hash_secret_raw

    return hash_secret_raw(
        secret=password.encode("utf-8"),
        salt=salt,
        time_cost=3,
        memory_cost=64 * 1024,
        parallelism=2,
        hash_len=32,
        type=Type.ID,
    )


def encrypt_file(plain: bytes, password: str) -> bytes:
    salt = os.urandom(16)
    key = derive_file_key(password, salt)
    nonce = os.urandom(12)
    token = AESGCM(key).encrypt(nonce, plain, None)
    return b"LM1" + salt + nonce + token


def decrypt_file(blob: bytes, password: str) -> bytes:
    if not blob.startswith(b"LM1"):
        raise ValueError("fichier non chiffré Ledger Maison")
    salt, nonce, token = blob[3:19], blob[19:31], blob[31:]
    key = derive_file_key(password, salt)
    return AESGCM(key).decrypt(nonce, token, None)


def write_encrypted(path: Path, plain: bytes, password: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encrypt_file(plain, password))
    os.chmod(path, 0o600)


def session_token() -> str:
    return secrets.token_urlsafe(32)
