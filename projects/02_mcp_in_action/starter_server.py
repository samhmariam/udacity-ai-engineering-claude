
import os
import json
import logging
import re
from typing import List, Dict, Optional
from firecrawl import FirecrawlApp
from urllib.parse import urlparse
from datetime import datetime
from mcp.server.fastmcp import FastMCP

from dotenv import load_dotenv

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

SCRAPE_DIR = "scraped_content"

mcp = FastMCP("llm_inference")

@mcp.tool()
def scrape_websites(
    websites: Dict[str, str],
    formats: List[str] = ['markdown', 'html'],
    api_key: Optional[str] = None
) -> List[str]:
    """
    Scrape multiple websites using Firecrawl and store their content.
    
    Args:
        websites: Dictionary of provider_name -> URL mappings
        formats: List of formats to scrape ['markdown', 'html'] (default: both)
        api_key: Firecrawl API key (if None, expects environment variable)
        
    Returns:
        List of provider names for successfully scraped websites
    """
    
    if api_key is None:
        api_key = os.getenv('FIRECRAWL_API_KEY')
        if not api_key:
            raise ValueError("API key must be provided or set as FIRECRAWL_API_KEY environment variable")
    
    app = FirecrawlApp(api_key=api_key)
    
    path = os.path.join(SCRAPE_DIR)
    os.makedirs(path, exist_ok=True)
    
    metadata_file = os.path.join(path, "scraped_metadata.json")

    try:
        with open(metadata_file, "r", encoding="utf-8") as file:
            scraped_metadata = json.load(file)
            if not isinstance(scraped_metadata, dict):
                scraped_metadata = {}
    except (FileNotFoundError, json.JSONDecodeError):
        scraped_metadata = {}

    requested_formats = list(dict.fromkeys(formats))
    successful_scrapes = []

    for provider_name, url in websites.items():
        safe_name = re.sub(r"[^A-Za-z0-9_.-]+", "_", provider_name).strip("._") or "website"
        metadata = {
            "provider_name": provider_name,
            "url": url,
            "domain": urlparse(url).netloc,
            "scraped_at": datetime.now().isoformat(),
            "formats": requested_formats,
            "success": False,
        }
        try:
            logger.info("Scraping %s: %s", provider_name, url)
            result = app.scrape(url, formats=requested_formats)
            scrape_result = result if isinstance(result, dict) else result.model_dump()

            # Firecrawl v4 returns a Document without a top-level success field.
            # Older response dictionaries may explicitly report failure.
            if scrape_result.get("success", True):
                page_metadata = scrape_result.get("metadata") or {}
                if hasattr(page_metadata, "model_dump"):
                    page_metadata = page_metadata.model_dump()

                content_files = {}
                for format_type in requested_formats:
                    content = scrape_result.get(format_type)
                    if content is not None:
                        filename = f"{safe_name}_{format_type}.txt"
                        with open(os.path.join(path, filename), "w", encoding="utf-8") as file:
                            file.write(str(content))
                        content_files[format_type] = filename

                metadata.update({
                    "success": True,
                    "content_files": content_files,
                    "title": page_metadata.get("title", ""),
                    "description": page_metadata.get("description", ""),
                })
                successful_scrapes.append(provider_name)
            else:
                metadata["error"] = scrape_result.get("error", "Unknown scraping error")
                logger.error("Failed to scrape %s: %s", provider_name, metadata["error"])
        except Exception as exc:
            metadata["error"] = str(exc)
            logger.error("Failed to scrape %s: %s", provider_name, exc)
        finally:
            scraped_metadata[provider_name] = metadata

    with open(metadata_file, "w", encoding="utf-8") as file:
        json.dump(scraped_metadata, file, indent=2, ensure_ascii=False)

    logger.info(
        "Scraping complete: %d of %d succeeded",
        len(successful_scrapes),
        len(websites),
    )
    return successful_scrapes

@mcp.tool()
def extract_scraped_info(identifier: str) -> str:
    """
    Extract information about a scraped website.
    
    Args:
        identifier: The provider name, full URL, or domain to look for
        
    Returns:
        Formatted JSON string with the scraped information
    """
    
    logger.info(f"Extracting information for identifier: {identifier}")
    metadata_file = os.path.join(SCRAPE_DIR, "scraped_metadata.json")
    logger.info(f"Checking metadata file: {metadata_file}")
    not_found = f"There's no saved information related to identifier '{identifier}'."

    try:
        logger.info("Files in %s: %s", SCRAPE_DIR, os.listdir(SCRAPE_DIR))
        with open(metadata_file, "r", encoding="utf-8") as file:
            scraped_metadata = json.load(file)
        if not isinstance(scraped_metadata, dict):
            return not_found
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return not_found

    lookup = identifier.strip().lower().rstrip("/")
    parsed_lookup = urlparse(
        identifier if "://" in identifier else f"//{identifier}",
        scheme="http",
    )
    lookup_domain = parsed_lookup.netloc.lower().split("@")[-1].split(":")[0]
    lookup_domain = lookup_domain.removeprefix("www.")

    match = None
    for provider_name, entry in scraped_metadata.items():
        url = str(entry.get("url", "")).lower().rstrip("/")
        domain = str(entry.get("domain", "")).lower().split(":")[0]
        domain = domain.removeprefix("www.")
        if (
            lookup == provider_name.lower()
            or lookup == url
            or (lookup_domain and lookup_domain == domain)
            or lookup == domain
        ):
            match = dict(entry)
            break

    if match is None:
        return not_found

    content = {}
    for content_format, filename in match.get("content_files", {}).items():
        file_path = os.path.join(SCRAPE_DIR, filename)
        try:
            with open(file_path, "r", encoding="utf-8") as file:
                content[content_format] = file.read()
        except OSError as exc:
            logger.warning("Could not read scraped content file %s: %s", file_path, exc)
            return not_found

    match["content"] = content
    return json.dumps(match, indent=2, ensure_ascii=False)

if __name__ == "__main__":
    mcp.run(transport="stdio")
