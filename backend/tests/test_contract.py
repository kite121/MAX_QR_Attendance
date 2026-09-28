def test_openapi_errors_match_runtime(client):
    specification = client.get("/api/v1/openapi.json").json()
    responses = specification["paths"]["/api/v1/check-ins"]["post"]["responses"]
    assert responses["422"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ApiErrorBody"
    csv_response = specification["paths"]["/api/v1/sessions/{session_id}/export.csv"]["get"]["responses"]["200"]
    assert "text/csv" in csv_response["content"]
    invalid = client.post("/api/v1/auth/mock", json={})
    assert invalid.status_code == 422
    assert invalid.json() == {
        "error": {"code": "VALIDATION_ERROR", "message": "Некорректные данные запроса", "details": None}
    }
