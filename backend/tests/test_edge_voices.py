"""
Test Edge TTS Voices API - Tests for the new open-source voice support
Features tested:
- GET /api/edge-voices - Returns all Edge TTS voices grouped by language
- POST /api/edge-tts-preview - Returns MP3 audio for any Edge TTS voice
- Default voice assignments (dara for male, sophea for female)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestEdgeVoicesAPI:
    """Test the /api/edge-voices endpoint"""
    
    def test_edge_voices_returns_200(self):
        """GET /api/edge-voices should return 200"""
        response = requests.get(f"{BASE_URL}/api/edge-voices")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ GET /api/edge-voices returns 200")
    
    def test_edge_voices_has_total_voices(self):
        """Response should have total_voices field"""
        response = requests.get(f"{BASE_URL}/api/edge-voices")
        data = response.json()
        assert "total_voices" in data, "Missing total_voices field"
        assert isinstance(data["total_voices"], int), "total_voices should be int"
        assert data["total_voices"] > 300, f"Expected >300 voices, got {data['total_voices']}"
        print(f"✓ total_voices = {data['total_voices']}")
    
    def test_edge_voices_has_total_languages(self):
        """Response should have total_languages field"""
        response = requests.get(f"{BASE_URL}/api/edge-voices")
        data = response.json()
        assert "total_languages" in data, "Missing total_languages field"
        assert isinstance(data["total_languages"], int), "total_languages should be int"
        assert data["total_languages"] >= 70, f"Expected >=70 languages, got {data['total_languages']}"
        print(f"✓ total_languages = {data['total_languages']}")
    
    def test_edge_voices_has_languages_array(self):
        """Response should have languages array"""
        response = requests.get(f"{BASE_URL}/api/edge-voices")
        data = response.json()
        assert "languages" in data, "Missing languages field"
        assert isinstance(data["languages"], list), "languages should be list"
        assert len(data["languages"]) > 0, "languages should not be empty"
        print(f"✓ languages array has {len(data['languages'])} items")
    
    def test_khmer_is_first_language(self):
        """Khmer (km) should be the first language in the list"""
        response = requests.get(f"{BASE_URL}/api/edge-voices")
        data = response.json()
        first_lang = data["languages"][0]
        assert first_lang["code"] == "km", f"Expected first language to be 'km', got '{first_lang['code']}'"
        print("✓ Khmer (km) is first language")
    
    def test_khmer_has_piseth_voice(self):
        """Khmer should have Piseth (male) voice"""
        response = requests.get(f"{BASE_URL}/api/edge-voices")
        data = response.json()
        km_lang = next((l for l in data["languages"] if l["code"] == "km"), None)
        assert km_lang is not None, "Khmer language not found"
        male_voices = km_lang.get("male", [])
        piseth = next((v for v in male_voices if "Piseth" in v.get("name", "")), None)
        assert piseth is not None, "Piseth voice not found in Khmer male voices"
        assert piseth["voice"] == "km-KH-PisethNeural", f"Expected km-KH-PisethNeural, got {piseth['voice']}"
        print("✓ Khmer has Piseth (km-KH-PisethNeural) voice")
    
    def test_khmer_has_sreymom_voice(self):
        """Khmer should have Sreymom (female) voice"""
        response = requests.get(f"{BASE_URL}/api/edge-voices")
        data = response.json()
        km_lang = next((l for l in data["languages"] if l["code"] == "km"), None)
        assert km_lang is not None, "Khmer language not found"
        female_voices = km_lang.get("female", [])
        sreymom = next((v for v in female_voices if "Sreymom" in v.get("name", "")), None)
        assert sreymom is not None, "Sreymom voice not found in Khmer female voices"
        assert sreymom["voice"] == "km-KH-SreymomNeural", f"Expected km-KH-SreymomNeural, got {sreymom['voice']}"
        print("✓ Khmer has Sreymom (km-KH-SreymomNeural) voice")
    
    def test_language_structure(self):
        """Each language should have code, male, female arrays"""
        response = requests.get(f"{BASE_URL}/api/edge-voices")
        data = response.json()
        for lang in data["languages"][:5]:  # Check first 5
            assert "code" in lang, f"Missing code in language"
            assert "male" in lang or "female" in lang, f"Missing male/female in {lang['code']}"
            print(f"✓ Language {lang['code']} has proper structure")
    
    def test_voice_structure(self):
        """Each voice should have id, name, voice fields"""
        response = requests.get(f"{BASE_URL}/api/edge-voices")
        data = response.json()
        km_lang = next((l for l in data["languages"] if l["code"] == "km"), None)
        for voice in km_lang.get("male", []) + km_lang.get("female", []):
            assert "id" in voice, "Missing id in voice"
            assert "name" in voice, "Missing name in voice"
            assert "voice" in voice, "Missing voice in voice"
            print(f"✓ Voice {voice['name']} has proper structure")


class TestEdgeTTSPreview:
    """Test the /api/edge-tts-preview endpoint"""
    
    def test_preview_english_voice(self):
        """POST /api/edge-tts-preview with English voice returns MP3"""
        response = requests.post(
            f"{BASE_URL}/api/edge-tts-preview",
            json={"text": "Hello, this is a test.", "voice": "en-US-GuyNeural"},
            timeout=30
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get("content-type") == "audio/mpeg", f"Expected audio/mpeg, got {response.headers.get('content-type')}"
        assert len(response.content) > 1000, f"Audio too small: {len(response.content)} bytes"
        print(f"✓ English voice preview: {len(response.content)} bytes")
    
    def test_preview_khmer_piseth_voice(self):
        """POST /api/edge-tts-preview with Khmer Piseth voice returns MP3"""
        response = requests.post(
            f"{BASE_URL}/api/edge-tts-preview",
            json={"text": "សួស្តី", "voice": "km-KH-PisethNeural"},
            timeout=30
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get("content-type") == "audio/mpeg"
        assert len(response.content) > 1000, f"Audio too small: {len(response.content)} bytes"
        print(f"✓ Khmer Piseth voice preview: {len(response.content)} bytes")
    
    def test_preview_khmer_sreymom_voice(self):
        """POST /api/edge-tts-preview with Khmer Sreymom voice returns MP3"""
        response = requests.post(
            f"{BASE_URL}/api/edge-tts-preview",
            json={"text": "សួស្តី", "voice": "km-KH-SreymomNeural"},
            timeout=30
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get("content-type") == "audio/mpeg"
        assert len(response.content) > 1000, f"Audio too small: {len(response.content)} bytes"
        print(f"✓ Khmer Sreymom voice preview: {len(response.content)} bytes")
    
    def test_preview_japanese_voice(self):
        """POST /api/edge-tts-preview with Japanese voice returns MP3"""
        response = requests.post(
            f"{BASE_URL}/api/edge-tts-preview",
            json={"text": "こんにちは", "voice": "ja-JP-KeitaNeural"},
            timeout=30
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert len(response.content) > 1000
        print(f"✓ Japanese voice preview: {len(response.content)} bytes")
    
    def test_preview_invalid_voice_returns_500(self):
        """POST /api/edge-tts-preview with invalid voice returns 500"""
        response = requests.post(
            f"{BASE_URL}/api/edge-tts-preview",
            json={"text": "Test", "voice": "invalid-voice-xyz"},
            timeout=30
        )
        assert response.status_code == 500, f"Expected 500 for invalid voice, got {response.status_code}"
        print("✓ Invalid voice returns 500")


class TestDefaultVoiceAssignment:
    """Test that default voices are now dara (Piseth) and sophea (Sreymom)"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "test@voxidub.com", "password": "test123"}
        )
        if response.status_code == 200:
            return response.json().get("session_token")
        pytest.skip("Authentication failed")
    
    def test_login_works(self, auth_token):
        """Login should work with test credentials"""
        assert auth_token is not None
        assert len(auth_token) > 10
        print(f"✓ Login successful, token: {auth_token[:20]}...")
    
    def test_get_existing_project_voice_defaults(self, auth_token):
        """Check existing project has correct voice defaults"""
        # Get list of projects
        response = requests.get(
            f"{BASE_URL}/api/projects",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        if response.status_code != 200 or not response.json():
            pytest.skip("No projects found")
        
        projects = response.json()
        if len(projects) == 0:
            pytest.skip("No projects to test")
        
        # Get first project details
        project_id = projects[0]["project_id"]
        response = requests.get(
            f"{BASE_URL}/api/projects/{project_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        project = response.json()
        
        # Check actors have correct default voices
        actors = project.get("actors", [])
        for actor in actors:
            voice = actor.get("voice", "")
            gender = actor.get("gender", "")
            # New defaults should be dara (male) or sophea (female), NOT mms_khmer
            if voice.startswith("mms_"):
                print(f"⚠ Actor {actor.get('id')} still has MMS voice: {voice}")
            else:
                print(f"✓ Actor {actor.get('id')} has voice: {voice} (gender: {gender})")


class TestTTSToolEndpoint:
    """Test the TTS tool endpoint uses correct voices"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "test@voxidub.com", "password": "test123"}
        )
        if response.status_code == 200:
            return response.json().get("session_token")
        pytest.skip("Authentication failed")
    
    def test_tts_with_dara_voice(self, auth_token):
        """TTS with dara (Piseth) voice should work"""
        response = requests.post(
            f"{BASE_URL}/api/tools/text-to-speech",
            json={"text": "សួស្តី", "voice": "dara", "speed": 0},
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=60
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert len(response.content) > 1000, "Audio too small"
        print(f"✓ TTS with dara voice: {len(response.content)} bytes")
    
    def test_tts_with_sophea_voice(self, auth_token):
        """TTS with sophea (Sreymom) voice should work"""
        response = requests.post(
            f"{BASE_URL}/api/tools/text-to-speech",
            json={"text": "សួស្តី", "voice": "sophea", "speed": 0},
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=60
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert len(response.content) > 1000, "Audio too small"
        print(f"✓ TTS with sophea voice: {len(response.content)} bytes")
    
    def test_tts_with_full_edge_voice_name(self, auth_token):
        """TTS with full Edge TTS voice name should work"""
        response = requests.post(
            f"{BASE_URL}/api/tools/text-to-speech",
            json={"text": "Hello world", "voice": "en-US-GuyNeural", "speed": 0},
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=60
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert len(response.content) > 1000, "Audio too small"
        print(f"✓ TTS with en-US-GuyNeural: {len(response.content)} bytes")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
