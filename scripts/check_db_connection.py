#!/usr/bin/env python3
"""Dependency-free Postgres connection smoke test.

Reads DATABASE_URL from .env.local, performs SSL + SCRAM auth, runs `select 1`,
and avoids printing secrets.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import socket
import ssl
import struct
import sys
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


AUTH_OK = 0
AUTH_SASL = 10
AUTH_SASL_CONTINUE = 11
AUTH_SASL_FINAL = 12
SSL_REQUEST_CODE = 80877103
PROTOCOL_VERSION = 196608


class PgCheckError(RuntimeError):
    pass


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        raise PgCheckError(f"Missing env file: {path}")

    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]
        values[key.strip()] = value
    return values


def recv_exact(sock: socket.socket | ssl.SSLSocket, size: int) -> bytes:
    chunks: list[bytes] = []
    remaining = size
    while remaining:
        chunk = sock.recv(remaining)
        if not chunk:
            raise PgCheckError("Connection closed unexpectedly")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def recv_msg(sock: socket.socket | ssl.SSLSocket) -> tuple[bytes, bytes]:
    msg_type = recv_exact(sock, 1)
    length = struct.unpack("!I", recv_exact(sock, 4))[0]
    return msg_type, recv_exact(sock, length - 4)


def send_msg(sock: socket.socket | ssl.SSLSocket, msg_type: bytes, body: bytes) -> None:
    sock.sendall(msg_type + struct.pack("!I", len(body) + 4) + body)


def parse_error(body: bytes) -> str:
    parts = body.split(b"\0")
    fields: dict[str, str] = {}
    for part in parts:
        if not part:
            continue
        field_type = chr(part[0])
        fields[field_type] = part[1:].decode("utf-8", errors="replace")
    return fields.get("M") or "Postgres returned an error"


def sasl_escape(value: str) -> str:
    return value.replace("=", "=3D").replace(",", "=2C")


def parse_scram_attributes(message: str) -> dict[str, str]:
    attrs: dict[str, str] = {}
    for item in message.split(","):
        if "=" not in item:
            continue
        key, value = item.split("=", 1)
        attrs[key] = value
    return attrs


def xor_bytes(left: bytes, right: bytes) -> bytes:
    return bytes(a ^ b for a, b in zip(left, right))


def handle_scram(
    sock: socket.socket | ssl.SSLSocket,
    body: bytes,
    user: str,
    password: str,
) -> None:
    mechanisms = [item.decode("utf-8", errors="replace") for item in body[4:].split(b"\0") if item]
    if "SCRAM-SHA-256" not in mechanisms:
        raise PgCheckError(f"Unsupported auth mechanisms: {', '.join(mechanisms) or 'none'}")

    client_nonce = base64.b64encode(secrets.token_bytes(18)).decode("ascii").rstrip("=")
    client_first_bare = f"n={sasl_escape(user)},r={client_nonce}"
    client_first = f"n,,{client_first_bare}"
    client_first_bytes = client_first.encode("utf-8")
    initial_body = b"SCRAM-SHA-256\0" + struct.pack("!I", len(client_first_bytes)) + client_first_bytes
    send_msg(sock, b"p", initial_body)

    msg_type, server_body = recv_msg(sock)
    if msg_type == b"E":
        raise PgCheckError(parse_error(server_body))
    if msg_type != b"R" or struct.unpack("!I", server_body[:4])[0] != AUTH_SASL_CONTINUE:
        raise PgCheckError("Expected SCRAM challenge from server")

    server_first = server_body[4:].decode("utf-8")
    attrs = parse_scram_attributes(server_first)
    nonce = attrs.get("r", "")
    salt = attrs.get("s")
    iterations = int(attrs.get("i", "0"))
    if not nonce.startswith(client_nonce) or not salt or not iterations:
        raise PgCheckError("Invalid SCRAM challenge from server")

    client_final_without_proof = f"c=biws,r={nonce}"
    auth_message = f"{client_first_bare},{server_first},{client_final_without_proof}".encode("utf-8")
    salted_password = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        base64.b64decode(salt),
        iterations,
    )
    client_key = hmac.new(salted_password, b"Client Key", hashlib.sha256).digest()
    stored_key = hashlib.sha256(client_key).digest()
    client_signature = hmac.new(stored_key, auth_message, hashlib.sha256).digest()
    client_proof = xor_bytes(client_key, client_signature)
    proof = base64.b64encode(client_proof).decode("ascii")
    client_final = f"{client_final_without_proof},p={proof}".encode("utf-8")
    send_msg(sock, b"p", client_final)


def wait_until_ready(sock: socket.socket | ssl.SSLSocket, user: str, password: str) -> None:
    while True:
        msg_type, body = recv_msg(sock)
        if msg_type == b"E":
            raise PgCheckError(parse_error(body))
        if msg_type == b"R":
            auth_code = struct.unpack("!I", body[:4])[0]
            if auth_code == AUTH_OK:
                continue
            if auth_code == AUTH_SASL:
                handle_scram(sock, body, user, password)
                continue
            if auth_code == AUTH_SASL_FINAL:
                continue
            raise PgCheckError(f"Unsupported Postgres auth code: {auth_code}")
        if msg_type == b"Z":
            return


def run_select_one(sock: socket.socket | ssl.SSLSocket) -> str:
    send_msg(sock, b"Q", b"select 1;\0")
    result = ""
    while True:
        msg_type, body = recv_msg(sock)
        if msg_type == b"E":
            raise PgCheckError(parse_error(body))
        if msg_type == b"D":
            column_count = struct.unpack("!H", body[:2])[0]
            offset = 2
            values: list[str] = []
            for _ in range(column_count):
                value_length = struct.unpack("!i", body[offset : offset + 4])[0]
                offset += 4
                if value_length == -1:
                    values.append("NULL")
                    continue
                raw_value = body[offset : offset + value_length]
                offset += value_length
                values.append(raw_value.decode("utf-8", errors="replace"))
            result = values[0] if values else ""
        if msg_type == b"Z":
            return result


def connect_and_check(database_url: str) -> tuple[str, str, str, str]:
    parsed = urlparse(database_url)
    host = parsed.hostname
    port = parsed.port or 5432
    user = unquote(parsed.username or "")
    password = unquote(parsed.password or "")
    database = unquote(parsed.path.lstrip("/") or "postgres")
    sslmode = parse_qs(parsed.query).get("sslmode", ["require"])[0]
    if not host or not user or not password:
        raise PgCheckError("DATABASE_URL is missing host, user, or password")

    raw_sock = socket.create_connection((host, port), timeout=12)
    try:
        raw_sock.sendall(struct.pack("!II", 8, SSL_REQUEST_CODE))
        response = recv_exact(raw_sock, 1)
        if response != b"S":
            raise PgCheckError("Server did not accept SSL")

        context = (
            ssl.create_default_context()
            if sslmode in {"verify-ca", "verify-full"}
            else ssl._create_unverified_context()
        )
        sock = context.wrap_socket(raw_sock, server_hostname=host)
        raw_sock = None
        try:
            params = {
                "user": user,
                "database": database,
                "application_name": "muaythai-memory-check",
            }
            payload = b"".join(
                key.encode("utf-8") + b"\0" + value.encode("utf-8") + b"\0"
                for key, value in params.items()
            ) + b"\0"
            sock.sendall(struct.pack("!I", len(payload) + 8) + struct.pack("!I", PROTOCOL_VERSION) + payload)
            wait_until_ready(sock, user, password)
            result = run_select_one(sock)
            return host, str(port), user, result
        finally:
            sock.close()
    finally:
        if raw_sock is not None:
            raw_sock.close()


def main() -> int:
    env_path = Path.cwd() / ".env.local"
    env = load_env(env_path)
    env_key = "DATABASE_URL"
    if "--env" in sys.argv:
        try:
            env_key = sys.argv[sys.argv.index("--env") + 1]
        except IndexError:
            print("--env requires a variable name", file=sys.stderr)
            return 1

    database_url = env.get(env_key, "").strip()
    if not database_url:
        print(f"{env_key} is empty in .env.local", file=sys.stderr)
        return 1

    if "--describe" in sys.argv:
        parsed = urlparse(database_url)
        print(
            {
                "scheme": parsed.scheme,
                "host": parsed.hostname,
                "port": parsed.port or 5432,
                "user": parsed.username,
                "database": parsed.path.lstrip("/") or "postgres",
            }
        )
        return 0

    try:
        host, port, user, result = connect_and_check(database_url)
    except Exception as exc:
        print(f"Database check failed: {exc}", file=sys.stderr)
        return 1

    if result != "1":
        print("Database check failed: query returned an unexpected result", file=sys.stderr)
        return 1

    safe_user = user[:32] + ("..." if len(user) > 32 else "")
    print(f"Database check passed: connected to {host}:{port} as {safe_user} and ran select 1.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
