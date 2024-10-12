import { GenerativeModel, GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { FileMetadataResponse, FileState, GoogleAIFileManager } from "@google/generative-ai/server";

// for now ask GEMINI
export function getModelForCategory(allowedCategories: string[]): GenerativeModel {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

  const schema = {
    description: "List of opposing label pairs in a given category",
    type: SchemaType.STRING,
  };

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    generationConfig: {
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: schema,
    },
    systemInstruction: `Given a set of labels, decide which one of these categories the labels fit the best. 
    The categories: [${allowedCategories}]`,
  });

  return model;
}

export function getModelForLabelPairs(): GenerativeModel {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

  const schema = {
    description: "List of opposing label pairs in a given category",
    type: SchemaType.ARRAY,
    items: {
      description: "A pair of strings that are opposites of each other in a given category",
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.STRING,
        nullable: false,
      },
    },
  };

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  return model;
}

export function getFileManager() {
  const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY ?? "");
  return fileManager;
}

export async function uploadToGemini(fileManager: GoogleAIFileManager, path: string, mimeType: string = "video/mp4"): Promise<FileMetadataResponse> {
  // Upload the file and specify a display name.
  const uploadResponse = await fileManager.uploadFile(path, {
    mimeType: mimeType,
  });

  let file = await fileManager.getFile(uploadResponse.file.name);
  while (file.state === FileState.PROCESSING) {
    process.stdout.write(".");
    // Sleep for 10 seconds
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    // Fetch the file from the API again
    file = await fileManager.getFile(uploadResponse.file.name);
  }

  if (file.state === FileState.FAILED) {
    throw new Error("Video processing failed.");
  }

  // When file.state is ACTIVE, the file is ready to be used for inference.
  console.log(`File ${file.displayName} is ready for inference as ${file.uri}`);
  return file;
}

export async function deleteFromGemini(fileManager: GoogleAIFileManager, file: FileMetadataResponse) {
  await fileManager.deleteFile(file.name);
}

export function getModelForVideoToText(): GenerativeModel {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

  // Choose a Gemini model.
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 8192,
      responseMimeType: "text/plain",
    },
    systemInstruction: "Get text out of the given video",
  });
  return model;
}

export function getModelForCitations(): GenerativeModel {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
  const schema = {
    type: SchemaType.ARRAY,
    items: {
      description: "URL for the source supporting the content",
      type: SchemaType.STRING,
    },
  };
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      temperature: 1,
      topP: 0.95,
      topK: 64,
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });
  return model;
}
