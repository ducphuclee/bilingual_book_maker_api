import redis
import json
import os
from datetime import datetime, timedelta
from typing import Dict, Optional

def get_redis_client():
    """Get Redis client"""
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    return redis.from_url(redis_url, decode_responses=True)

def update_task_status(task_id: str, status_data: Dict):
    """Update task status in Redis"""
    try:
        r = get_redis_client()
        status_data["updated_at"] = datetime.utcnow().isoformat()
        r.setex(f"task:{task_id}", 3600, json.dumps(status_data))  # Expire in 1 hour
    except Exception as e:
        print(f"Failed to update task status: {e}")

def get_task_status(task_id: str) -> Optional[Dict]:
    """Get task status from Redis"""
    try:
        r = get_redis_client()
        data = r.get(f"task:{task_id}")
        if data:
            return json.loads(data)
        return None
    except Exception as e:
        print(f"Failed to get task status: {e}")
        return None

def cleanup_old_files(days: int = 7):
    """Cleanup old files and Redis keys"""
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    # Cleanup output files
    output_dir = "outputs"
    if os.path.exists(output_dir):
        for task_dir in os.listdir(output_dir):
            task_path = os.path.join(output_dir, task_dir)
            if os.path.isdir(task_path):
                # Check directory creation time
                dir_time = datetime.fromtimestamp(os.path.getctime(task_path))
                if dir_time < cutoff_date:
                    import shutil
                    shutil.rmtree(task_path)
    
    # Cleanup Redis keys (optional - Redis TTL handles this)
    try:
        r = get_redis_client()
        keys = r.keys("task:*")
        for key in keys:
            data = r.get(key)
            if data:
                status = json.loads(data)
                if "updated_at" in status:
                    updated_time = datetime.fromisoformat(status["updated_at"])
                    if updated_time < cutoff_date:
                        r.delete(key)
    except Exception as e:
        print(f"Redis cleanup failed: {e}")
