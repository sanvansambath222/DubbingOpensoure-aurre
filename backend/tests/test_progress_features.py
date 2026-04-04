"""
Test suite for Progress Bar & Chunked Translation Features
"""
import pytest
import requests
import os


@pytest.fixture(scope="module")
def api_url():
    base = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
    if not base:
        pytest.skip('REACT_APP_BACKEND_URL required')
    return f"{base}/api"


@pytest.fixture(scope="module")
def headers():
    token = os.environ.get('TEST_SESSION_TOKEN', '')
    return {"Authorization": f"Bearer {token}"}


class TestQueueStatusEndpoint:
    @pytest.fixture(scope="class")
    def test_project(self, api_url, headers):
        r = requests.post(f"{api_url}/projects", json={"title": "Progress Test"}, headers=headers)
        p = r.json()
        yield p
        requests.delete(f"{api_url}/projects/{p['project_id']}", headers=headers)

    def test_queue_status_returns_fields(self, api_url, headers, test_project):
        pid = test_project["project_id"]
        r = requests.get(f"{api_url}/projects/{pid}/queue-status", headers=headers)
        assert r.status_code == 200
        data = r.json()
        for field in ["project_id", "status", "queue_status", "step", "progress", "total", "elapsed", "eta"]:
            assert field in data, f"Missing field: {field}"

    def test_queue_status_idle(self, api_url, headers, test_project):
        pid = test_project["project_id"]
        r = requests.get(f"{api_url}/projects/{pid}/queue-status", headers=headers)
        data = r.json()
        assert data["progress"] == 0
        assert data["total"] == 0


class TestTranslateWithLanguage:
    @pytest.fixture(scope="class")
    def test_project(self, api_url, headers):
        r = requests.post(f"{api_url}/projects", json={"title": "Lang Test"}, headers=headers)
        p = r.json()
        yield p
        requests.delete(f"{api_url}/projects/{p['project_id']}", headers=headers)

    def test_translate_accepts_target_language(self, api_url, headers, test_project):
        pid = test_project["project_id"]
        r = requests.post(f"{api_url}/projects/{pid}/translate-segments?target_language=th", headers=headers)
        # Should fail gracefully (no segments), not error on param
        assert r.status_code in [200, 400]
