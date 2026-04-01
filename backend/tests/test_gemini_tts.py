"""
Test Gemini TTS Integration - Iteration 11
Tests for:
- GET /api/gemini-voices - returns 30 Gemini voices with name, gender, style
- POST /api/gemini-tts-preview - generates WAV audio from text with Gemini voice
- GET /api/gcloud-voices - regression check
- POST /api/gcloud-tts-preview - regression check
- POST /api/projects - create project works
- PATCH /api/projects/{id} - update actor with tts_provider=gemini works
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
AUTH_TOKEN = "test_session_001"

@pytest.fixture
def api_client():
    """Shared requests session with auth header"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {AUTH_TOKEN}"
    })
    return session


class TestGeminiVoices:
    """Test GET /api/gemini-voices endpoint"""
    
    def test_gemini_voices_returns_30_voices(self, api_client):
        """GET /api/gemini-voices should return 30 Gemini voices"""
        response = api_client.get(f"{BASE_URL}/api/gemini-voices")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "voices" in data, "Response should contain 'voices' key"
        assert "total" in data, "Response should contain 'total' key"
        
        voices = data["voices"]
        assert len(voices) == 30, f"Expected 30 voices, got {len(voices)}"
        assert data["total"] == 30, f"Expected total=30, got {data['total']}"
        print(f"✓ GET /api/gemini-voices returns {len(voices)} voices")
    
    def test_gemini_voice_structure(self, api_client):
        """Each Gemini voice should have name, gender, style"""
        response = api_client.get(f"{BASE_URL}/api/gemini-voices")
        assert response.status_code == 200
        
        voices = response.json()["voices"]
        for voice in voices:
            assert "name" in voice, f"Voice missing 'name': {voice}"
            assert "gender" in voice, f"Voice missing 'gender': {voice}"
            assert "style" in voice, f"Voice missing 'style': {voice}"
            assert voice["gender"] in ["MALE", "FEMALE"], f"Invalid gender: {voice['gender']}"
        
        # Check specific voices exist
        voice_names = [v["name"] for v in voices]
        expected_voices = ["Kore", "Puck", "Aoede", "Charon", "Fenrir"]
        for expected in expected_voices:
            assert expected in voice_names, f"Expected voice '{expected}' not found"
        
        print(f"✓ All 30 voices have correct structure (name, gender, style)")
    
    def test_gemini_voices_gender_distribution(self, api_client):
        """Check gender distribution of Gemini voices"""
        response = api_client.get(f"{BASE_URL}/api/gemini-voices")
        assert response.status_code == 200
        
        voices = response.json()["voices"]
        male_count = sum(1 for v in voices if v["gender"] == "MALE")
        female_count = sum(1 for v in voices if v["gender"] == "FEMALE")
        
        assert male_count > 0, "Should have male voices"
        assert female_count > 0, "Should have female voices"
        print(f"✓ Gender distribution: {male_count} male, {female_count} female voices")


class TestGeminiTTSPreview:
    """Test POST /api/gemini-tts-preview endpoint"""
    
    def test_gemini_tts_preview_returns_wav(self, api_client):
        """POST /api/gemini-tts-preview should return WAV audio"""
        response = api_client.post(
            f"{BASE_URL}/api/gemini-tts-preview",
            json={
                "text": "Hello, this is a test.",
                "voice_name": "Kore",
                "language_code": "en-US"
            },
            timeout=30
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.headers.get("content-type") == "audio/wav", f"Expected audio/wav, got {response.headers.get('content-type')}"
        assert len(response.content) > 1000, f"Audio content too small: {len(response.content)} bytes"
        
        # Check WAV header (RIFF)
        assert response.content[:4] == b'RIFF', "Response should be valid WAV file (RIFF header)"
        print(f"✓ POST /api/gemini-tts-preview returns WAV audio ({len(response.content)} bytes)")
    
    def test_gemini_tts_preview_different_voices(self, api_client):
        """Test preview with different Gemini voices"""
        test_voices = ["Puck", "Aoede", "Charon"]
        
        for voice in test_voices:
            response = api_client.post(
                f"{BASE_URL}/api/gemini-tts-preview",
                json={
                    "text": "Testing voice preview.",
                    "voice_name": voice,
                    "language_code": "en-US"
                },
                timeout=30
            )
            assert response.status_code == 200, f"Voice {voice} failed: {response.status_code}"
            assert len(response.content) > 1000, f"Voice {voice} audio too small"
        
        print(f"✓ Tested {len(test_voices)} different Gemini voices successfully")


class TestGCloudTTSRegression:
    """Regression tests for Google Cloud TTS (should still work)"""
    
    def test_gcloud_voices_still_works(self, api_client):
        """GET /api/gcloud-voices should still return voices"""
        response = api_client.get(f"{BASE_URL}/api/gcloud-voices")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "voices" in data, "Response should contain 'voices'"
        assert len(data["voices"]) > 100, f"Expected many voices, got {len(data['voices'])}"
        print(f"✓ GET /api/gcloud-voices still works ({len(data['voices'])} voices)")
    
    def test_gcloud_tts_preview_still_works(self, api_client):
        """POST /api/gcloud-tts-preview should still return audio"""
        response = api_client.post(
            f"{BASE_URL}/api/gcloud-tts-preview",
            json={
                "text": "Hello, this is a test.",
                "voice_name": "en-US-Standard-A",
                "language_code": "en-US"
            },
            timeout=30
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "audio" in response.headers.get("content-type", ""), f"Expected audio content type"
        assert len(response.content) > 500, f"Audio content too small"
        print(f"✓ POST /api/gcloud-tts-preview still works ({len(response.content)} bytes)")


class TestProjectWithGeminiVoice:
    """Test project CRUD with Gemini voice settings"""
    
    def test_create_project(self, api_client):
        """POST /api/projects should create a new project"""
        response = api_client.post(
            f"{BASE_URL}/api/projects",
            json={"title": "TEST_Gemini_Voice_Project"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "project_id" in data, "Response should contain project_id"
        assert data["title"] == "TEST_Gemini_Voice_Project"
        
        # Store project_id for cleanup
        TestProjectWithGeminiVoice.test_project_id = data["project_id"]
        print(f"✓ Created project: {data['project_id']}")
        return data["project_id"]
    
    def test_update_actor_with_gemini_voice(self, api_client):
        """PATCH /api/projects/{id} should update actor with tts_provider=gemini"""
        project_id = getattr(TestProjectWithGeminiVoice, 'test_project_id', None)
        if not project_id:
            project_id = self.test_create_project(api_client)
        
        # Update project with actors including Gemini voice settings
        actors = [
            {
                "id": "SPEAKER_00",
                "label": "Test Actor",
                "gender": "female",
                "voice": "sophea",
                "tts_provider": "gemini",
                "gemini_voice": "Kore",
                "gcloud_voice": None,
                "gcloud_language": None
            }
        ]
        
        response = api_client.patch(
            f"{BASE_URL}/api/projects/{project_id}",
            json={"actors": actors}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify actor was updated with Gemini settings
        updated_actors = data.get("actors", [])
        assert len(updated_actors) == 1, f"Expected 1 actor, got {len(updated_actors)}"
        
        actor = updated_actors[0]
        assert actor["tts_provider"] == "gemini", f"Expected tts_provider=gemini, got {actor.get('tts_provider')}"
        assert actor["gemini_voice"] == "Kore", f"Expected gemini_voice=Kore, got {actor.get('gemini_voice')}"
        
        print(f"✓ Updated actor with tts_provider=gemini, gemini_voice=Kore")
    
    def test_get_project_with_gemini_actor(self, api_client):
        """GET /api/projects/{id} should return project with Gemini actor settings"""
        project_id = getattr(TestProjectWithGeminiVoice, 'test_project_id', None)
        if not project_id:
            pytest.skip("No test project created")
        
        response = api_client.get(f"{BASE_URL}/api/projects/{project_id}")
        assert response.status_code == 200
        
        data = response.json()
        actors = data.get("actors", [])
        
        if actors:
            actor = actors[0]
            assert actor.get("tts_provider") == "gemini"
            assert actor.get("gemini_voice") == "Kore"
            print(f"✓ GET project returns actor with Gemini voice settings")
    
    def test_cleanup_test_project(self, api_client):
        """Delete test project"""
        project_id = getattr(TestProjectWithGeminiVoice, 'test_project_id', None)
        if not project_id:
            pytest.skip("No test project to clean up")
        
        response = api_client.delete(f"{BASE_URL}/api/projects/{project_id}")
        assert response.status_code == 200
        
        # Verify deletion
        response = api_client.get(f"{BASE_URL}/api/projects/{project_id}")
        assert response.status_code == 404, "Project should be deleted"
        
        print(f"✓ Cleaned up test project: {project_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
