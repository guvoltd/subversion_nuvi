"""
Subversion Nuvi - Brute-Force Shield API Router
"""

from fastapi import APIRouter, HTTPException, status
from backend.api.models.dto import ShieldStatusResponse, UnbanRequest
from backend.api.services.shield_service import shield_service

router = APIRouter(prefix="/shield", tags=["Brute-Force Shield"])

@router.get("/status", response_model=ShieldStatusResponse, summary="Get brute-force shield status and active bans")
def get_shield_status():
    return shield_service.get_status()

@router.post("/unban", status_code=status.HTTP_200_OK, summary="Manually lift ban on an IP or subnet")
def unban_ip(req: UnbanRequest):
    success = shield_service.unban(req.ip_or_subnet)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No active ban found for '{req.ip_or_subnet}'.")
    return {"status": "success", "message": f"Ban on '{req.ip_or_subnet}' has been lifted."}
