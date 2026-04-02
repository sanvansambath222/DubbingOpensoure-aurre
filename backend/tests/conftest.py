"""Test configuration and shared fixtures for VoxiDub tests."""
import os
import pytest
import requests

# All test config from environment variables
TEST_BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_AUTH_TOKEN = os.environ.get('TEST_SESSION_TOKEN', '')
TEST_USER_ID = os.environ.get('TEST_USER_ID', '')

# Test credentials
TEST_EMAIL = "test@voxidub.com"
TEST_PASSWORD = "test123"

if not TEST_BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL environment variable is required for tests")

API_URL = f"{TEST_BASE_URL}/api"

# Get auth token dynamically if not provided
if not TEST_AUTH_TOKEN:
    try:
        response = requests.post(f"{API_URL}/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        }, timeout=10)
        if response.status_code == 200:
            TEST_AUTH_TOKEN = response.json().get("session_token", "")
            print(f"✓ Got auth token dynamically: {TEST_AUTH_TOKEN[:20]}...")
    except Exception as e:
        print(f"⚠ Could not get auth token: {e}")


@pytest.fixture(scope="session")
def base_url():
    return TEST_BASE_URL


@pytest.fixture(scope="session")
def api_url():
    return API_URL


@pytest.fixture(scope="session")
def auth_token():
    return TEST_AUTH_TOKEN


@pytest.fixture(scope="session")
def auth_headers():
    return {"Authorization": f"Bearer {TEST_AUTH_TOKEN}"}
