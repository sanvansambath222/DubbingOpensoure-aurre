"""Test configuration and shared fixtures for VoxiDub tests."""
import os
import pytest
import requests

# All test config from environment variables
TEST_BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_AUTH_TOKEN = os.environ.get('TEST_SESSION_TOKEN', '')
TEST_USER_ID = os.environ.get('TEST_USER_ID', '')

# Test credentials
TEST_EMAIL = os.environ.get('TEST_EMAIL', 'test@voxidub.com')
TEST_PASSWORD = os.environ.get('TEST_PASSWORD', '')

if not TEST_BASE_URL:
    pytest.skip("REACT_APP_BACKEND_URL environment variable is required", allow_module_level=True)

API_URL = f"{TEST_BASE_URL}/api"


@pytest.fixture(scope="session")
def _auth_token():
    """Lazy auth token - only fetched when needed."""
    token = TEST_AUTH_TOKEN
    if not token:
        try:
            response = requests.post(f"{API_URL}/auth/login", json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD
            }, timeout=10)
            if response.status_code == 200:
                token = response.json().get("session_token", "")
                print("Got auth token dynamically")
        except Exception as e:
            print(f"Could not get auth token: {e}")
    return token


@pytest.fixture(scope="session")
def base_url():
    return TEST_BASE_URL


@pytest.fixture(scope="session")
def api_url():
    return API_URL


@pytest.fixture(scope="session")
def auth_token(_auth_token):
    return _auth_token


@pytest.fixture(scope="session")
def auth_headers(_auth_token):
    return {"Authorization": f"Bearer {_auth_token}"}
