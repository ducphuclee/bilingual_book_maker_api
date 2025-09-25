from celery import Celery
import os
import sys
import traceback
import subprocess
from typing import List
from .utils import update_task_status, get_redis_client

# Add parent directory to path to import make_book
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Celery app
celery_app = Celery(
    "bilingual_book_maker",
    broker=os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    result_expires=3600,
)

@celery_app.task(bind=True)
def translate_book_task(
    self,
    task_id: str,
    file_paths: List[str],
    model: str = "gpt-3.5-turbo",
    language: str = "vietnamese",
    resume: bool = False,
    translate_tags: List[str] = None,
    book_from: str = "",
    book_to: str = ""
):
    """Background task to translate books"""
    
    if translate_tags is None:
        translate_tags = ["p"]
    
    try:
        # Update status to processing
        update_task_status(task_id, {
            "status": "processing",
            "progress": 0,
            "current_file": "",
            "total_files": len(file_paths),
            "completed_files": 0,
            "results": []
        })
        
        results = []
        
        for i, file_path in enumerate(file_paths):
            filename = os.path.basename(file_path)
            
            # Update current file status
            update_task_status(task_id, {
                "status": "processing",
                "progress": int((i / len(file_paths)) * 100),
                "current_file": filename,
                "completed_files": i,
                "results": results
            })
            
            try:
                # Create output directory for this task
                output_dir = os.path.join("outputs", task_id)
                os.makedirs(output_dir, exist_ok=True)
                
                # Build command arguments
                cmd = [
                    sys.executable, "make_book.py",
                    "--book_name", file_path,
                    "--openai_key", os.getenv("OPENAI_API_KEY", ""),
                    "--model", model,
                    "--language", language,
                    "--translate_tags", ",".join(translate_tags)
                ]
                
                if resume:
                    cmd.append("--resume")
                
                if book_from:
                    cmd.extend(["--book_from", book_from])
                
                if book_to:
                    cmd.extend(["--book_to", book_to])
                
                # Run translation
                process = subprocess.run(
                    cmd,
                    cwd=os.path.dirname(os.path.abspath(__file__ + "/../")),
                    capture_output=True,
                    text=True,
                    timeout=3600  # 1 hour timeout
                )
                
                if process.returncode == 0:
                    # Find output file
                    output_file = self._find_output_file(file_path, output_dir)
                    if output_file:
                        results.append({
                            "input_file": filename,
                            "output_file": os.path.basename(output_file),
                            "status": "success"
                        })
                    else:
                        results.append({
                            "input_file": filename,
                            "error": "Output file not found",
                            "status": "error"
                        })
                else:
                    results.append({
                        "input_file": filename,
                        "error": process.stderr or "Translation failed",
                        "status": "error"
                    })
                    
            except subprocess.TimeoutExpired:
                results.append({
                    "input_file": filename,
                    "error": "Translation timeout (>1 hour)",
                    "status": "error"
                })
            except Exception as e:
                results.append({
                    "input_file": filename,
                    "error": str(e),
                    "status": "error"
                })
        
        # Final status update
        success_count = sum(1 for r in results if r["status"] == "success")
        final_status = "completed" if success_count > 0 else "failed"
        
        update_task_status(task_id, {
            "status": final_status,
            "progress": 100,
            "current_file": "",
            "completed_files": len(file_paths),
            "total_files": len(file_paths),
            "results": results,
            "success_count": success_count,
            "error_count": len(results) - success_count
        })
        
        return {
            "task_id": task_id,
            "status": final_status,
            "results": results
        }
        
    except Exception as e:
        # Update status to failed
        error_msg = f"Task failed: {str(e)}\n{traceback.format_exc()}"
        update_task_status(task_id, {
            "status": "failed",
            "error": error_msg,
            "progress": 0
        })
        raise
    
    finally:
        # Cleanup uploaded files
        for file_path in file_paths:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
            except:
                pass

def _find_output_file(self, input_file: str, output_dir: str) -> str:
    """Find the generated output file"""
    base_name = os.path.splitext(os.path.basename(input_file))[0]
    
    # Common output patterns
    patterns = [
        f"{base_name}_bilingual.epub",
        f"{base_name}_translated.epub",
        f"{base_name}.epub",
        f"{base_name}_bilingual.txt",
        f"{base_name}_translated.txt",
        f"{base_name}.txt"
    ]
    
    # Check in output directory and current directory
    search_dirs = [output_dir, "."]
    
    for search_dir in search_dirs:
        for pattern in patterns:
            file_path = os.path.join(search_dir, pattern)
            if os.path.exists(file_path):
                # Move to output directory if not already there
                if search_dir != output_dir:
                    new_path = os.path.join(output_dir, pattern)
                    os.rename(file_path, new_path)
                    return new_path
                return file_path
    
    return None
