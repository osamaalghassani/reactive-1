/// <reference types="vitest" />

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import UnoCSS from 'unocss/vite'
import Unfonts from 'unplugin-fonts/vite'
import { imagetools } from 'vite-imagetools'
// import { VitePWA } from 'vite-plugin-pwa'
import Inspect from 'vite-plugin-inspect'
import topLevelAwait from 'vite-plugin-top-level-await'
import AutoImport from 'unplugin-auto-import/vite'
import { lingui } from "@lingui/vite-plugin";

// get files in pattern
import { promises as fs } from 'fs';
import path from 'path';
import { normalizePath  } from 'vite'

async function getFiles(directory, pattern) {
  try {
    const files = await fs.readdir(directory);
    let matchingFiles = [];

    for (const file of files) {
      const filePath = path.join(directory, file);
      const stat = await fs.stat(filePath);

      if (stat.isDirectory()) {
        // If it's a directory, get the files in that directory
        const subdirectoryFiles = await fs.readdir(filePath);
        const matchingSubdirectoryFiles = subdirectoryFiles
          .filter(subItem => pattern.test(subItem))
          .map(subItem => path.join(filePath, subItem));

        matchingFiles = matchingFiles.concat(matchingSubdirectoryFiles);
      } else if (pattern.test(file)) {
        // If it's a file and matches the pattern, add it to the result
        matchingFiles.push(filePath);
      }
    }

    return matchingFiles;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

async function listFiles(baseDirectory: string) {
  // Define the patterns for matching files
  const topLevelPattern = /\.tsx$/;
  const subdirectoryPattern = /^route\.tsx$/;

  let result = []

  try {
    const topLevelFiles = await getFiles(baseDirectory, topLevelPattern);
    const subdirectoryFiles = await getFiles(baseDirectory, subdirectoryPattern);

    result.push(...topLevelFiles)
    result.push(...subdirectoryFiles)
  } catch (error) {
    console.error('Error:', error);
  }

  return result.map(path => normalizePath(path).replace('src/routes/', ''))
}

function buildRoutesMap(strings, level = 0) {
  const result = [];

  const firstSegments = new Set(
    strings
      .map(str => str.split('.')[level].replace('/route', ''))
      .filter(str => str !== undefined && str !== 'tsx' && str !== 'lazy')
  );

  if (firstSegments.size === 0) {
    return { routesMap: result };
  }

  const reversedSegments = Array.from(firstSegments).reverse();

  for (const segment of reversedSegments) {
    const filteredStrings = strings
      .filter(str => str.split('.')[level] === segment || str.split('.')[level] === `${segment}/route`)

    const path = segment.replace(/\(([^)]*)\)\??$/, '$1?').replace(/\$+$/, '*').replace(/^\$/, ':');

    if (filteredStrings.length === 0) {
      continue;
    }

    const newNode = {};

    if (path === '_index') {
      newNode.index = true;
    } else if (!path.startsWith('_')) {
      newNode.path = path;
    }

    const page = filteredStrings.find(str => 
      str.endsWith(`${segment}.tsx`) ||
      str.endsWith(`${segment}.lazy.tsx`) ||
      str.endsWith(`${segment}/route.tsx`) ||
      str.endsWith(`${segment}/route.lazy.tsx`)
    );

    if (page) {
      newNode.lazy = `ImportStart'@/routes/${page}'ImportEnd`;
    }

    const { routesMap } = buildRoutesMap(filteredStrings, level + 1);
    if (routesMap.length > 0) {
      newNode.children = routesMap;
    }

    result.push(newNode);
  }

  return { routesMap: result };
}



function remixRouter({ baseDirectory } = { baseDirectory: 'src/routes' }) {
  return {
    name: 'vite-plugin-remix-router',
    enforce: 'pre',
    resolveId(source) {
      if (source === 'router:routes') {
        return source
      }
    },
    async load(id) {
      if (id === 'router:routes') {
        // generate router from routes
        const files = await listFiles(baseDirectory)
        const tree = [{
          path: '/',
          lazy: `ImportStart'@/root.lazy.tsx'ImportEnd`,
          children: []
        }]
        const { routesMap } = buildRoutesMap(files)
        tree[0].children = routesMap
        // console.log(JSON.stringify(routesMap, null, 2));

        const routesObject = JSON.stringify(tree)
          .replace(/"ImportStart/g, '() => import(')
          .replace(/ImportEnd"/g, ')')
          // .replace(/"spread":"spreadStart/g, '...')
          // .replace(/spreadEnd"/g, '')

        const routesCode = `export const routes = ${routesObject}`
        return routesCode
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  resolve: { alias: { '@': '/src' } },
  test: {
    environment: "happy-dom",
  },
  plugins: [
    react({
      babel: {
        plugins: ["macros"],
      },
    }),
    lingui(),
    remixRouter(),
    UnoCSS(),
    Inspect(),
    topLevelAwait(),

    Unfonts({
      fontsource: { 
        families: [{
          name: 'Lato',
          weights: [100,300,400,700,900]
        }] 
      } 
    }),

    // add `declare module "@/assets/*"` to vite-env.d.ts to use with typescript
    imagetools(),

    AutoImport({
      imports: [
        'react', 
        'react-router-dom',
      ],
      dirs: [
        "src/components/**",
        "src/config/**",
      ],
      defaultExportByFilename: true,
      dts: true,
      injectAtEnd: true,
      eslintrc: { enabled: true }
    })
  ],
})
