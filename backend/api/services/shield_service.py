"""
Subversion Nuvi - Password Guessing Attack Protection (Brute-Force Shield)
Implements an in-memory, thread-safe sliding-window rate limiter with IPv6 /64 prefix aggregation
and subnet whitelisting to block brute-force password guessing attacks.
"""

import ipaddress
import threading
import time
from typing import Dict, List, Tuple, Any
from backend.api.config import config

class BruteForceShield:
    def __init__(self):
        self._lock = threading.Lock()
        # Key: canonical network key (e.g. '192.168.1.50/32' or '2001:db8:abcd:1234::/64')
        # Value: list of timestamps of failed attempts
        self._failed_attempts: Dict[str, List[float]] = {}
        # Key: canonical network key, Value: unban timestamp
        self._active_bans: Dict[str, float] = {}

    def _normalize_client_network(self, ip_str: str) -> str:
        """
        Normalizes an IP string to its network boundary:
        - IPv4: /32 single host
        - IPv6: /64 subnet prefix (to thwart IPv6 address-rotation brute force)
        """
        try:
            ip = ipaddress.ip_address(ip_str.strip())
            if ip.version == 4:
                return f"{ip}/32"
            else:
                # Truncate to /64 network
                network = ipaddress.ip_network(f"{ip}/64", strict=False)
                return str(network)
        except ValueError:
            # Fallback for hostnames or raw strings
            return ip_str.strip()

    def _is_whitelisted(self, ip_str: str) -> bool:
        """Checks if the IP falls within any configured trusted subnet."""
        try:
            client_ip = ipaddress.ip_address(ip_str.strip())
            for subnet_str in config.TRUSTED_SUBNETS:
                subnet = ipaddress.ip_network(subnet_str, strict=False)
                if client_ip in subnet:
                    return True
        except ValueError:
            pass
        return False

    def is_ip_banned(self, ip_str: str) -> bool:
        """Determines if the given IP address is currently banned."""
        if self._is_whitelisted(ip_str):
            return False

        key = self._normalize_client_network(ip_str)
        now = time.time()

        with self._lock:
            ban_until = self._active_bans.get(key)
            if ban_until:
                if now < ban_until:
                    return True
                else:
                    # Ban expired
                    del self._active_bans[key]
                    self._failed_attempts.pop(key, None)
                    return False
        return False

    def record_failed_attempt(self, ip_str: str) -> Tuple[bool, int]:
        """
        Records a failed authentication attempt.
        Returns:
            Tuple[is_banned_now: bool, remaining_attempts_before_ban: int]
        """
        if self._is_whitelisted(ip_str):
            return False, 999

        key = self._normalize_client_network(ip_str)
        now = time.time()
        window_start = now - config.BAN_RESET_SECONDS

        with self._lock:
            # Clean up old timestamps
            attempts = self._failed_attempts.get(key, [])
            attempts = [t for t in attempts if t >= window_start]
            attempts.append(now)
            self._failed_attempts[key] = attempts

            count = len(attempts)
            if count >= config.BAN_THRESHOLD:
                # Impose ban
                self._active_bans[key] = now + config.BAN_DURATION_SECONDS
                return True, 0
            else:
                remaining = max(0, config.BAN_THRESHOLD - count)
                return False, remaining

    def record_successful_attempt(self, ip_str: str) -> None:
        """Resets failed attempt counter upon successful authentication."""
        key = self._normalize_client_network(ip_str)
        with self._lock:
            self._failed_attempts.pop(key, None)

    def unban(self, ip_or_subnet: str) -> bool:
        """Manually lifts a ban on an IP or subnet."""
        key = self._normalize_client_network(ip_or_subnet)
        with self._lock:
            if key in self._active_bans:
                del self._active_bans[key]
                self._failed_attempts.pop(key, None)
                return True
            # Also try direct key match
            if ip_or_subnet in self._active_bans:
                del self._active_bans[ip_or_subnet]
                self._failed_attempts.pop(ip_or_subnet, None)
                return True
        return False

    def get_status(self) -> Dict[str, Any]:
        """Returns snapshot of current shield status for administration."""
        now = time.time()
        with self._lock:
            # Prune expired bans
            expired = [k for k, v in self._active_bans.items() if now >= v]
            for k in expired:
                del self._active_bans[k]
                self._failed_attempts.pop(k, None)

            banned_list = []
            for k, ban_until in self._active_bans.items():
                banned_list.append({
                    "subnet_or_ip": k,
                    "remaining_seconds": max(0, int(ban_until - now)),
                    "banned_until": time.strftime("%Y-%m-%d %H:%M:%SZ", time.gmtime(ban_until))
                })

            return {
                "active_bans_count": len(self._active_bans),
                "failed_attempts_tracked": sum(len(v) for v in self._failed_attempts.values()),
                "banned_ips": banned_list,
                "trusted_subnets": config.TRUSTED_SUBNETS
            }

# Global singleton
shield_service = BruteForceShield()
