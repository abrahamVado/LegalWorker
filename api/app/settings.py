# app/settings.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from typing import List, Optional

class Settings(BaseSettings):
    # load .env and ignore unknown keys (prevents “extra inputs” errors)
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = Field(default="Legal Analyzer API")
    ENV: str = Field(default="dev")
    ALLOWED_ORIGINS: str = Field(default="http://127.0.0.1:5173,http://localhost:5173")
    STORAGE_DIR: str = Field(default="app/storage/documents")

    # Ollama / GPU
    OLLAMA_URL: str = Field(default="http://127.0.0.1:11434")
    OLLAMA_MODEL: str = Field(default="llama3.1:8b")
    OLLAMA_EMBED_MODEL: str = Field(default="nomic-embed-text")
    OLLAMA_NUM_GPU_LAYERS: Optional[int] = None
    OLLAMA_MAIN_GPU: Optional[int] = None
    OLLAMA_LOW_VRAM: bool = False

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

settings = Settings()
