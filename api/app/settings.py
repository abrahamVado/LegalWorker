from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List

class Settings(BaseSettings):
    APP_NAME: str = Field(default="Legal Analyzer API")
    ENV: str = Field(default="dev")
    ALLOWED_ORIGINS: str = Field(default="http://127.0.0.1:5173,http://localhost:5173")
    STORAGE_DIR: str = Field(default="app/storage/documents")

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"

settings = Settings()
