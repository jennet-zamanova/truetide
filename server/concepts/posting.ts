import { ObjectId } from "mongodb";

import { AssemblyAI } from "assemblyai";
import DocCollection, { BaseDoc } from "../framework/doc";
import { NotAllowedError, NotFoundError } from "./errors";

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY || "",
});

export interface PostOptions {
  backgroundColor?: string;
}

export interface PostDoc extends BaseDoc {
  author: ObjectId;
  content: ObjectId;
  options?: PostOptions;
}

/**
 * concept: Posting [Author]
 */
export default class PostingConcept {
  public readonly posts: DocCollection<PostDoc>;

  /**
   * Make an instance of Posting.
   */
  constructor(collectionName: string) {
    this.posts = new DocCollection<PostDoc>(collectionName);
  }

  async create(author: ObjectId, filePath: string, options?: PostOptions) {
    const content = await this.posts.uploadVideo(filePath);
    console.log("content id: ", content);
    const _id = await this.posts.createOne({ author, content, options });
    return { msg: "Post successfully created!", post: await this.posts.readOne({ _id }) };
  }

  async getPosts() {
    // Returns all posts! You might want to page for better client performance
    return await this.posts.readMany({}, { sort: { _id: -1 } });
  }

  async getPost(_id: ObjectId) {
    // Returns specific post!
    return await this.posts.readOne({ _id });
  }

  async idsToVideos(ids: ObjectId[]) {
    const posts = await this.posts.readMany({ _id: { $in: ids } });
    // NOT SURE HOW TO DO WO DOWNLOADING THE VIDEO -> adding a screenshot feels like a lot of work for poc
    // Store strings in Map because ObjectId comparison by reference is wrong
    console.log("here are the posts with ids", posts);
    const videoIds: [string, string][] = await Promise.all(
      posts.map(async (post) => {
        const videoPath = post.content + "download.mp4";
        await this.posts.downloadVideo(post.content, videoPath);
        return [post._id.toString(), videoPath];
      }),
    );
    console.log("post id to video path", videoIds);
    const idToVideo = new Map(videoIds);
    return ids.map((id) => idToVideo.get(id.toString()) ?? "DELETED_POST");
  }

  async getPostsSubset(ids: ObjectId[]): Promise<PostDoc[]> {
    const optionalContentPosts = await Promise.all(
      ids.map(async (content: ObjectId) => {
        return await this.getPost(content);
      }),
    );
    const contentPosts = optionalContentPosts.filter((contentPost) => contentPost !== null);
    return contentPosts;
  }

  async getByAuthor(author: ObjectId) {
    return await this.posts.readMany({ author });
  }

  async update(_id: ObjectId, content?: string, options?: PostOptions) {
    // Note that if content or options is undefined, those fields will *not* be updated
    // since undefined values for partialUpdateOne are ignored.
    if (content !== undefined) {
      const content_id = await this.posts.uploadVideo(content);
      await this.posts.partialUpdateOne({ _id }, { content: content_id, options });
    } else {
      await this.posts.partialUpdateOne({ _id }, { options });
    }
    return { msg: "Post successfully updated!" };
  }

  async delete(_id: ObjectId) {
    const video_id = (await this.posts.readOne({ _id }))?.content;
    await this.posts.deleteOne({ _id });
    if (video_id) {
      await this.posts.deleteVideo(video_id);
    }
    return { msg: "Post deleted successfully!" };
  }

  /**
   * Extracts text out of video content posted previously
   * @param _id video content id
   * @returns the text that was spoken in the content
   */
  async getContentText(_id: ObjectId) {
    const content = await this.posts.readOne({ _id });
    // TODO: somehow get mp4
    if (content === null) {
      throw new NotFoundError(`Post ${_id} does not exist!`);
    }
    const downloaded_file = await this.posts.downloadVideo(content.content, "uploaded_video.mp4");
    // somehow get text
    const text = this.getFileText(downloaded_file);
    return text;
  }

  /**
   * Extracts text out of video file
   * @param file some video file
   * @returns text spoken in the file
   */
  async getFileText(filePath: string): Promise<string> {
    // const content = await this.posts.readOne({ file });
    const outputAudioPath = filePath.substring(0, -1) + "3";
    // somehow get text
    const mp3 = await this.convertVideoToAudio(filePath, outputAudioPath);
    console.log("Audio extraction gave" + mp3);
    // const text = await this.getText(outputAudioPath);
    return "text";
  }

  private async convertVideoToAudio(videoFilePath: string, outputAudioPath: string): Promise<string> {
    // somehow get mp3
    // console.log("trying to convert file");
    // const ffmpeg = new FFmpeg();
    // console.log("creted ff");
    // if (!ffmpeg.loaded) {
    //   console.log("FFmpeg is NOT loaded");
    //   await ffmpeg.load();
    //   console.log("FFmpeg is loaded");
    // }

    // // Example of writing and reading a file
    // await ffmpeg.writeFile("input.txt", "hello world!");
    // const data = await ffmpeg.readFile("input.txt");
    // return data.toString();
    // var ffmpeg = require("ffmpeg");
    // console.log("creting ff");
    // var video = await new ffmpeg(videoFilePath);
    // console.log("creted ff");
    // const data = await video.fnExtractSoundToMP3(outputAudioPath, function (error: any, file: any) {
    //   if (!error) console.log("Audio file: " + file);
    //   else {
    //     console.log("Here the audio file: " + file);
    //     return file;
    //   }
    // });
    // return data;
    const ffmpeg = require("fluent-ffmpeg");
    try {
      // Use ffmpeg to extract audio from the video
      await new Promise((resolve, reject) => {
        ffmpeg(videoFilePath).audioCodec("libmp3lame").output(outputAudioPath).on("end", resolve).on("error", reject).run();
      });

      // Send the extracted audio file as a download
      // res.download(outputAudioPath, 'extracted_audio.mp3', (err: any) => {
      //   if (err) {
      //     console.error(err);
      //   }
      // });
    } catch (error) {
      console.error("Error extracting audio:", error);
    }
    return "erer";
  }

  // private async tempconvertVideoToAudio(videoFilePath: string, outputAudioPath: string): Promise<string> {
  //   // somehow get mp3
  //   const ffmpeg = createFFmpeg({ log: true });
  //   await ffmpeg.load();
  //   ffmpeg.FS("writeFile", videoFilePath, await fetchFile(videoFilePath));
  //   await ffmpeg.run("-i", videoFilePath, outputAudioPath);
  //   const data = ffmpeg.FS("readFile", outputAudioPath);
  //   process.exit(0);
  // }

  private async getText(audioFilePath: string): Promise<string> {
    const params = {
      audio: audioFilePath,
      speaker_labels: true,
    };
    const transcript = await client.transcripts.transcribe(params);

    if (transcript.status === "error") {
      console.error(`Transcription failed: ${transcript.error}`);
      process.exit(1);
    }

    console.log(transcript.text);
    let text = "";
    for (let utterance of transcript.utterances!) {
      text += utterance.text;
      // console.log(`Speaker ${utterance.speaker}: ${utterance.text}`); for debugging
    }
    return text;
  }

  async assertAuthorIsUser(_id: ObjectId, user: ObjectId) {
    const post = await this.posts.readOne({ _id });
    if (!post) {
      throw new NotFoundError(`Post ${_id} does not exist!`);
    }
    if (post.author.toString() !== user.toString()) {
      throw new PostAuthorNotMatchError(user, _id);
    }
  }
}

export class PostAuthorNotMatchError extends NotAllowedError {
  constructor(
    public readonly author: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} is not the author of post {1}!", author, _id);
  }
}
