import { NextRequest, NextResponse } from 'next/server';

import { globNovelFiles, readNovelFile } from '@/store/story-files';
import { resolveProjectPath } from '@/lib/project-path';
import { getToolProgress } from '@/lib/tool-progress';

export async function GET(request: NextRequest) {
  const projectId =
    request.nextUrl.searchParams.get('projectId') ??
    request.nextUrl.searchParams.get('threadId');

  if (!projectId) {
    return NextResponse.json(
      { success: false, message: 'projectId is required' },
      { status: 400 },
    );
  }

  try {
    const storyDir = resolveProjectPath();

    const sceneFiles = await globNovelFiles(storyDir, 'scenes/*.md');
    let currentSceneId = '';
    let currentLocation = '';
    if (sceneFiles.length > 0) {
      const latestScene = sceneFiles[sceneFiles.length - 1];
      currentSceneId = latestScene.replace('scenes/', '').replace('.md', '');
      const sceneContent = await readNovelFile(storyDir, latestScene);
      if (sceneContent) {
        const locationMatch = sceneContent.match(/## 地点\s*\n(.+)/);
        if (locationMatch) {
          currentLocation = locationMatch[1].trim();
        }
      }
    }

    const characterFiles = await globNovelFiles(storyDir, 'characters');
    const characters = characterFiles.map((f) => f.replace('characters/', '').replace('.md', ''));

    return NextResponse.json({
      success: true,
      sceneId: currentSceneId,
      location: currentLocation,
      characters,
      toolProgress: getToolProgress(projectId),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get status',
      },
      { status: 500 },
    );
  }
}
