// MIT License
//
// Copyright (c) 2020 Excalidraw
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// copied from https://github.com/excalidraw/excalidraw/blob/969d3c694aedba0fdf74f8a7f727118655acba84/src/data/image.ts
// as suggested in https://github.com/excalidraw/excalidraw/discussions/3756#discussioncomment-899556
// keep as long as excalidraw is not able to read or write image file with embedded scene

import decodePng from "png-chunks-extract";
import tEXt from "png-chunk-text";
import encodePng from "png-chunks-encode";
import {base64ToString, decode, encode, stringToBase64} from "./codec";
import {EXPORT_DATA_TYPES, MIME_TYPES} from "./constants";

// -----------------------------------------------------------------------------
// PNG
// -----------------------------------------------------------------------------

const blobToArrayBuffer = (blob: Blob): Promise<ArrayBuffer> => {
    if ("arrayBuffer" in blob) {
        return blob.arrayBuffer();
    }
    // Safari
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (!event.target?.result) {
                return reject(new Error("couldn't convert blob to ArrayBuffer"));
            }
            resolve(event.target.result as ArrayBuffer);
        };
        reader.readAsArrayBuffer(blob);
    });
};

export const getTEXtChunk = async (
    blob: Blob,
): Promise<{ keyword: string; text: string } | null> => {
    const chunks = decodePng(new Uint8Array(await blobToArrayBuffer(blob)));
    const metadataChunk = chunks.find((chunk) => chunk.name === "tEXt");
    if (metadataChunk) {
        return tEXt.decode(metadataChunk.data);
    }
    return null;
};

export const encodePngMetadata = async ({
    blob,
    metadata,
}: {
    blob: Blob;
    metadata: string;
}) => {
    const chunks = decodePng(new Uint8Array(await blobToArrayBuffer(blob)));

    const metadataChunk = tEXt.encode(
        MIME_TYPES.excalidraw,
        JSON.stringify(
            await encode({
                text: metadata,
                compress: true,
            }),
        ),
    );
    // insert metadata before last chunk (iEND)
    chunks.splice(-1, 0, metadataChunk);

    return new Blob([encodePng(chunks)], { type: "image/png" });
};

export const decodePngMetadata = async (blob: Blob) => {
    const metadata = await getTEXtChunk(blob);
    if (metadata?.keyword === MIME_TYPES.excalidraw) {
        try {
            const encodedData = JSON.parse(metadata.text);
            if (!("encoded" in encodedData)) {
                // legacy, un-encoded scene JSON
                if (
                    "type" in encodedData &&
                    encodedData.type === EXPORT_DATA_TYPES.excalidraw
                ) {
                    return metadata.text;
                }
                throw new Error("FAILED");
            }
            return await decode(encodedData);
        } catch (error) {
            console.error(error);
            throw new Error("FAILED");
        }
    }
    throw new Error("INVALID");
};

// -----------------------------------------------------------------------------
// SVG
// -----------------------------------------------------------------------------

// usage :
// encodeSvgMetadata({
//   text: serializeAsJSON(elements, appState),
// })
export const encodeSvgMetadata = async ({ text }: { text: string }) => {
    const base64 = await stringToBase64(
        JSON.stringify(await encode({ text })),
        true /* is already byte string */,
    );

    let metadata = "";
    metadata += `<!-- payload-type:${MIME_TYPES.excalidraw} -->`;
    metadata += `<!-- payload-version:2 -->`;
    metadata += "<!-- payload-start -->";
    metadata += base64;
    metadata += "<!-- payload-end -->";
    return metadata;
};

export const decodeSvgMetadata = async ({ svg }: { svg: string }) => {
    if (svg.includes(`payload-type:${MIME_TYPES.excalidraw}`)) {
        const match = svg.match(/<!-- payload-start -->(.+?)<!-- payload-end -->/);
        if (!match) {
            throw new Error("INVALID");
        }
        const versionMatch = svg.match(/<!-- payload-version:(\d+) -->/);
        const version = versionMatch?.[1] || "1";
        const isByteString = version !== "1";

        try {
            const json = await base64ToString(match[1], isByteString);
            const encodedData = JSON.parse(json);
            if (!("encoded" in encodedData)) {
                // legacy, un-encoded scene JSON
                if (
                    "type" in encodedData &&
                    encodedData.type === EXPORT_DATA_TYPES.excalidraw
                ) {
                    return json;
                }
                throw new Error("FAILED");
            }
            return await decode(encodedData);
        } catch (error) {
            console.error(error);
            throw new Error("FAILED");
        }
    }
    throw new Error("INVALID");
};
