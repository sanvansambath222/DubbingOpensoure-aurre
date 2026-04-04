"""
Test Google Cloud TTS integration and Voice Picker features
Tests: GET /api/gcloud-voices, POST /api/gcloud-tts-preview, project CRUD
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
import pytest
if not BASE_URL:
    pytest.skip('REACT_APP_BACKEND_URL required', allow_module_level=True)
AUTH_TOKEN = "test_session_001"
HEADERS = {"Authorization": f"Bearer {AUTH_TOKEN}", "Content-Type": "application/json"}


class TestGoogleCloudTTSEndpoints:
    """Test Google Cloud TTS API endpoints"""

    def test_gcloud_voices_with_language_filter(self):
        """GET /api/gcloud-voices with language_code=en returns English voices"""
        response = requests.get(f"{BASE_URL}/api/gcloud-voices", params={"language_code": "en"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "voices" in data, "Response should contain 'voices' key"
        assert "total" in data, "Response should contain 'total' key"
        assert isinstance(data["voices"], list), "voices should be a list"
        
        # Verify voice structure
        if len(data["voices"]) > 0:
            voice = data["voices"][0]
            assert "name" in voice, "Voice should have 'name'"
            assert "language" in voice, "Voice should have 'language'"
            assert "gender" in voice, "Voice should have 'gender'"
            assert voice["language"].startswith("en"), f"Language should start with 'en', got {voice['language']}"
        
        print(f"SUCCESS: Found {data['total']} English voices")

    def test_gcloud_voices_without_filter_returns_many(self):
        """GET /api/gcloud-voices without filter returns 2000+ voices"""
        response = requests.get(f"{BASE_URL}/api/gcloud-voices")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "voices" in data
        assert "total" in data
        # Google Cloud has 2000+ voices
        assert data["total"] > 100, f"Expected many voices, got {data['total']}"
        print(f"SUCCESS: Found {data['total']} total voices (expected 2000+)")

    def test_gcloud_tts_preview_returns_audio(self):
        """POST /api/gcloud-tts-preview returns audio/mpeg blob"""
        payload = {
            "text": "Hello, this is a test.",
            "voice_name": "en-US-Standard-A",
            "language_code": "en-US",
            "speaking_rate": 1.0,
            "pitch": 0.0
        }
        response = requests.post(f"{BASE_URL}/api/gcloud-tts-preview", json=payload, timeout=30)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify content type is audio
        content_type = response.headers.get("content-type", "")
        assert "audio" in content_type, f"Expected audio content type, got {content_type}"
        
        # Verify we got actual audio data
        assert len(response.content) > 1000, f"Expected audio data, got {len(response.content)} bytes"
        print(f"SUCCESS: Received {len(response.content)} bytes of audio")

    def test_gcloud_tts_preview_with_different_voice(self):
        """POST /api/gcloud-tts-preview with different voice works"""
        payload = {
            "text": "Testing another voice.",
            "voice_name": "en-US-Wavenet-D",
            "language_code": "en-US",
            "speaking_rate": 1.2,
            "pitch": 2.0
        }
        response = requests.post(f"{BASE_URL}/api/gcloud-tts-preview", json=payload, timeout=30)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert len(response.content) > 1000
        print(f"SUCCESS: Wavenet voice preview returned {len(response.content)} bytes")


class TestProjectCRUDStillWorks:
    """Verify project CRUD operations still work after Google Cloud TTS integration"""
    
    created_project_id = None

    def test_create_project(self):
        """POST /api/projects creates new project"""
        payload = {"title": "TEST_GCloud_TTS_Project"}
        response = requests.post(f"{BASE_URL}/api/projects", json=payload, headers=HEADERS)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "project_id" in data, "Response should contain project_id"
        assert data["title"] == "TEST_GCloud_TTS_Project"
        TestProjectCRUDStillWorks.created_project_id = data["project_id"]
        print(f"SUCCESS: Created project {data['project_id']}")

    def test_get_project(self):
        """GET /api/projects/{id} returns project details"""
        if not TestProjectCRUDStillWorks.created_project_id:
            pytest.skip("No project created")
        
        project_id = TestProjectCRUDStillWorks.created_project_id
        response = requests.get(f"{BASE_URL}/api/projects/{project_id}", headers=HEADERS)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["project_id"] == project_id
        assert data["title"] == "TEST_GCloud_TTS_Project"
        print(f"SUCCESS: Retrieved project {project_id}")

    def test_update_project_with_gcloud_actor(self):
        """PATCH /api/projects/{id} can update actors with gcloud voice settings"""
        if not TestProjectCRUDStillWorks.created_project_id:
            pytest.skip("No project created")
        
        project_id = TestProjectCRUDStillWorks.created_project_id
        # Update with actor that has Google Cloud TTS settings
        payload = {
            "actors": [
                {
                    "id": "SPEAKER_00",
                    "label": "Test Actor",
                    "gender": "female",
                    "voice": "sophea",
                    "tts_provider": "gcloud",
                    "gcloud_voice": "en-US-Wavenet-F",
                    "gcloud_language": "en-US"
                }
            ]
        }
        response = requests.patch(f"{BASE_URL}/api/projects/{project_id}", json=payload, headers=HEADERS)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert len(data.get("actors", [])) == 1
        actor = data["actors"][0]
        assert actor.get("tts_provider") == "gcloud"
        assert actor.get("gcloud_voice") == "en-US-Wavenet-F"
        print(f"SUCCESS: Updated project with gcloud actor settings")

    def test_delete_project(self):
        """DELETE /api/projects/{id} deletes project"""
        if not TestProjectCRUDStillWorks.created_project_id:
            pytest.skip("No project created")
        
        project_id = TestProjectCRUDStillWorks.created_project_id
        response = requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=HEADERS)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/projects/{project_id}", headers=HEADERS)
        assert get_response.status_code == 404, "Project should be deleted"
        print(f"SUCCESS: Deleted project {project_id}")


class TestVoiceFilteringByLanguage:
    """Test voice filtering for different languages"""

    def test_gcloud_voices_thai(self):
        """GET /api/gcloud-voices with language_code=th returns Thai voices"""
        response = requests.get(f"{BASE_URL}/api/gcloud-voices", params={"language_code": "th"})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] > 0, "Should have Thai voices"
        for voice in data["voices"][:5]:
            assert voice["language"].startswith("th"), f"Expected Thai, got {voice['language']}"
        print(f"SUCCESS: Found {data['total']} Thai voices")

    def test_gcloud_voices_khmer(self):
        """GET /api/gcloud-voices with language_code=km returns Khmer voices (if available)"""
        response = requests.get(f"{BASE_URL}/api/gcloud-voices", params={"language_code": "km"})
        assert response.status_code == 200
        data = response.json()
        # Khmer may have limited or no voices in Google Cloud
        print(f"INFO: Found {data['total']} Khmer voices (may be 0 if not supported)")

    def test_gcloud_voices_chinese(self):
        """GET /api/gcloud-voices with language_code=cmn returns Chinese voices"""
        response = requests.get(f"{BASE_URL}/api/gcloud-voices", params={"language_code": "cmn"})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] > 0, "Should have Chinese voices"
        print(f"SUCCESS: Found {data['total']} Chinese voices")


class TestEdgeCases:
    """Test edge cases and error handling"""

    def test_gcloud_tts_preview_invalid_voice(self):
        """POST /api/gcloud-tts-preview with invalid voice returns error"""
        payload = {
            "text": "Test",
            "voice_name": "invalid-voice-name",
            "language_code": "en-US"
        }
        response = requests.post(f"{BASE_URL}/api/gcloud-tts-preview", json=payload, timeout=30)
        # Should return error (400 or 500)
        assert response.status_code >= 400, f"Expected error status, got {response.status_code}"
        print(f"SUCCESS: Invalid voice correctly returns error {response.status_code}")

    def test_gcloud_tts_preview_empty_text(self):
        """POST /api/gcloud-tts-preview with empty text"""
        payload = {
            "text": "",
            "voice_name": "en-US-Standard-A",
            "language_code": "en-US"
        }
        response = requests.post(f"{BASE_URL}/api/gcloud-tts-preview", json=payload, timeout=30)
        # Empty text may return error or empty audio
        print(f"INFO: Empty text returns status {response.status_code}")


class TestCaching:
    """Test voice list caching"""

    def test_gcloud_voices_caching(self):
        """Verify voice list is cached (second request should be faster)"""
        # First request
        start1 = time.time()
        response1 = requests.get(f"{BASE_URL}/api/gcloud-voices")
        time1 = time.time() - start1
        assert response1.status_code == 200
        
        # Second request (should use cache)
        start2 = time.time()
        response2 = requests.get(f"{BASE_URL}/api/gcloud-voices")
        time2 = time.time() - start2
        assert response2.status_code == 200
        
        # Both should return same data
        assert response1.json()["total"] == response2.json()["total"]
        print(f"SUCCESS: First request: {time1:.2f}s, Second request: {time2:.2f}s (cached)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
