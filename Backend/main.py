from fastapi import FastAPI

app = FastAPI(title="Image Prepare API")


@app.get("/")
def read_root():
    return {"message": "Hello World"}
