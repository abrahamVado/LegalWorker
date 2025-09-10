
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from typing import List

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    APP_NAME: str = Field(default="Legal Document Analyzer API")
    ENV: str = Field(default="dev")
    ALLOWED_ORIGINS: str = Field(default="http://localhost:5173,http://127.0.0.1:5173")
    STORAGE_DIR: str = Field(default="app/storage/documents")
    LOG_LEVEL: str = Field(default="info")
    HOST: str = Field(default="0.0.0.0")
    PORT: int = Field(default=8000)

    @property
    def ALLOWED_ORIGINS_LIST(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

settings = Settings()
# For convenience in CORS middleware:
settings.ALLOWED_ORIGINS = settings.ALLOWED_ORIGINS_LIST
