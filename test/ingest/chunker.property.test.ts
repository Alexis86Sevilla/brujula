import { chunkMarkdown } from "../../src/ingest/chunker.js";
import { chunkerContract } from "../contracts/chunker.contract.js";

chunkerContract("chunkMarkdown", chunkMarkdown);