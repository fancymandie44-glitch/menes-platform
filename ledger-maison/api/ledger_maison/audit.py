from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True, slots=True)
class AuditEvent:
    at: str
    action: str
    entity: str
    entity_id: str
    before: str | None
    after: str | None


def stamp(action: str, entity: str, entity_id: str, before: str | None, after: str | None) -> AuditEvent:
    return AuditEvent(
        at=datetime.now(timezone.utc).isoformat(),
        action=action,
        entity=entity,
        entity_id=entity_id,
        before=before,
        after=after,
    )
