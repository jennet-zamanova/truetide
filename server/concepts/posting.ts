import { ObjectId } from "mongodb";

import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";
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
    const videoIds: [string, string][] = await Promise.all(
      posts.map(async (post) => {
        const videoPath = post.content + "download";
        await this.posts.downloadVideo(post.content, videoPath);
        return [post._id.toString(), videoPath];
      }),
    );
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
    await this.posts.deleteOne({ _id });
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
    const text = this.convertVideoToAudio(filePath, outputAudioPath)
      .then(async () => {
        console.log("Audio extraction successful.");
        const text = await this.getText(outputAudioPath);
        return text;
      })
      .catch((err) => String(err));
    return text;
  }

  private async convertVideoToAudio(videoFilePath: string, outputAudioPath: string): Promise<string> {
    // somehow get mp3
    const ffmpeg = createFFmpeg({ log: true });
    await ffmpeg.load();
    ffmpeg.FS("writeFile", videoFilePath, await fetchFile(videoFilePath));
    await ffmpeg.run("-i", videoFilePath, outputAudioPath);
    const data = ffmpeg.FS("readFile", outputAudioPath);
    process.exit(0);
  }

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
