from typing import Optional, Tuple

def parse_range(range_header: Optional[str], file_size: int) -> Tuple[int, int]:
    # Returns (start, end) inclusive. If no/invalid Range provided, returns (0, file_size-1)
    if not range_header or not range_header.startswith("bytes="):
        return 0, file_size - 1
    try:
        ranges = range_header.replace("bytes=", "").strip()
        start_str, end_str = ranges.split("-", 1)
        start = int(start_str) if start_str else 0
        end = int(end_str) if end_str else file_size - 1
        if start < 0: start = 0
        if end >= file_size: end = file_size - 1
        if start > end:  # invalid -> serve whole
            return 0, file_size - 1
        return start, end
    except Exception:
        return 0, file_size - 1
