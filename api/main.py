from fastapi import FastAPI, File, UploadFile, Form, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.requests import Request
import os
import uuid
import json
from typing import List, Optional
from .tasks import translate_book_task
from .utils import get_task_status, cleanup_old_files

app = FastAPI(title="Bilingual Book Maker", version="1.0.0")

# Static files and templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Directories
UPLOAD_DIR = "uploads"
OUTPUT_DIR = "outputs"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Web interface"""
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/upload")
async def upload_files(
    files: List[UploadFile] = File(...),
    model: str = Form("gpt-3.5-turbo"),
    language: str = Form("vietnamese"),
    resume: bool = Form(False),
    translate_tags: str = Form("p"),
    book_from: str = Form(""),
    book_to: str = Form("")
):
    """Upload files and start translation"""
    try:
        # Generate unique task ID
        task_id = str(uuid.uuid4())
        
        # Save uploaded files
        file_paths = []
        for file in files:
            if not file.filename:
                continue
                
            # Validate file type
            allowed_extensions = ['.epub', '.txt', '.srt']
            if not any(file.filename.lower().endswith(ext) for ext in allowed_extensions):
                raise HTTPException(400, f"Unsupported file type: {file.filename}")
            
            file_path = os.path.join(UPLOAD_DIR, f"{task_id}_{file.filename}")
            with open(file_path, "wb") as f:
                content = await file.read()
                f.write(content)
            file_paths.append(file_path)
        
        if not file_paths:
            raise HTTPException(400, "No valid files uploaded")
        
        # Start background task
        task = translate_book_task.delay(
            task_id=task_id,
            file_paths=file_paths,
            model=model,
            language=language,
            resume=resume,
            translate_tags=translate_tags.split(",") if translate_tags else ["p"],
            book_from=book_from,
            book_to=book_to
        )
        
        return {
            "task_id": task_id,
            "celery_task_id": task.id,
            "status": "started",
            "files": [os.path.basename(f) for f in file_paths]
        }
        
    except Exception as e:
        raise HTTPException(500, f"Upload failed: {str(e)}")

@app.get("/status/{task_id}")
async def get_status(task_id: str):
    """Get task status and progress"""
    try:
        status = get_task_status(task_id)
        if not status:
            raise HTTPException(404, "Task not found")
        return status
    except Exception as e:
        raise HTTPException(500, f"Status check failed: {str(e)}")

@app.get("/download/{task_id}/{filename}")
async def download_file(task_id: str, filename: str):
    """Download translated file"""
    try:
        file_path = os.path.join(OUTPUT_DIR, task_id, filename)
        if not os.path.exists(file_path):
            raise HTTPException(404, "File not found")
        
        return FileResponse(
            path=file_path,
            filename=filename,
            media_type='application/octet-stream'
        )
    except Exception as e:
        raise HTTPException(500, f"Download failed: {str(e)}")

@app.get("/tasks")
async def list_tasks():
    """List all tasks (for debugging)"""
    try:
        # Get all task IDs from Redis or file system
        tasks = []
        if os.path.exists(OUTPUT_DIR):
            for task_id in os.listdir(OUTPUT_DIR):
                status = get_task_status(task_id)
                if status:
                    tasks.append(status)
        return {"tasks": tasks}
    except Exception as e:
        raise HTTPException(500, f"Failed to list tasks: {str(e)}")

@app.delete("/cleanup")
async def cleanup_files(days: int = 7):
    """Cleanup old files (optional endpoint)"""
    try:
        cleanup_old_files(days)
        return {"message": f"Cleaned up files older than {days} days"}
    except Exception as e:
        raise HTTPException(500, f"Cleanup failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
