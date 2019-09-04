import * as THREE from 'three';
import { GLTFMesh, GLTFPrimitive, VRMSchema } from '../types';
import { renameMaterialProperty } from '../utils/renameMaterialProperty';
import { VRMBlendShapeGroup } from './VRMBlendShapeGroup';
import { VRMBlendShapeProxy } from './VRMBlendShapeProxy';

export class VRMBlendShapeImporter {
  public async import(gltf: THREE.GLTF, schemaBlendShape: VRMSchema.BlendShape): Promise<VRMBlendShapeProxy | null> {
    const blendShape = new VRMBlendShapeProxy();

    const blendShapeGroups: VRMSchema.BlendShapeGroup[] | undefined = schemaBlendShape.blendShapeGroups;
    if (!blendShapeGroups) {
      return blendShape;
    }

    const blendShapePresetMap: { [presetName in VRMSchema.BlendShapePresetName]?: string } = {};

    await Promise.all(
      blendShapeGroups.map(async (schemaGroup) => {
        const name = schemaGroup.name;
        if (name === undefined) {
          console.warn('VRMBlendShapeImporter: One of blendShapeGroups has no name');
          return;
        }

        let presetName: VRMSchema.BlendShapePresetName | undefined;
        if (
          schemaGroup.presetName &&
          schemaGroup.presetName !== VRMSchema.BlendShapePresetName.Unknown &&
          !blendShapePresetMap[schemaGroup.presetName]
        ) {
          presetName = schemaGroup.presetName;
          blendShapePresetMap[schemaGroup.presetName] = name;
        }

        const group = new VRMBlendShapeGroup(name);
        gltf.scene.add(group);

        group.isBinary = schemaGroup.isBinary || false;

        if (schemaGroup.binds) {
          schemaGroup.binds.forEach(async (bind) => {
            if (bind.mesh === undefined || bind.index === undefined) {
              return;
            }

            const morphMeshes: GLTFMesh = await gltf.parser.getDependency('mesh', bind.mesh);
            const primitives: GLTFPrimitive[] =
              morphMeshes.type === 'Group'
                ? (morphMeshes.children as Array<GLTFPrimitive>)
                : [morphMeshes as GLTFPrimitive];
            const morphTargetIndex = bind.index;
            if (
              !primitives.every(
                (primitive) =>
                  Array.isArray(primitive.morphTargetInfluences) &&
                  morphTargetIndex < primitive.morphTargetInfluences.length,
              )
            ) {
              console.warn(
                `VRMBlendShapeImporter: ${
                  schemaGroup.name
                } attempts to index ${morphTargetIndex}th morph but not found.`,
              );
              return;
            }

            group.addBind({
              meshes: primitives,
              morphTargetIndex,
              weight: bind.weight || 100,
            });
          });
        }

        const materialValues = schemaGroup.materialValues;
        if (materialValues) {
          materialValues.forEach((materialValue) => {
            if (
              materialValue.materialName === undefined ||
              materialValue.propertyName === undefined ||
              materialValue.targetValue === undefined
            ) {
              return;
            }

            const materials: THREE.Material[] = [];
            gltf.scene.traverse((object) => {
              if ((object as any).material) {
                const material: THREE.Material[] | THREE.Material = (object as any).material;
                if (Array.isArray(material)) {
                  materials.push(
                    ...material.filter(
                      (mtl) => mtl.name === materialValue.materialName! && materials.indexOf(mtl) === -1,
                    ),
                  );
                } else if (material.name === materialValue.materialName && materials.indexOf(material) === -1) {
                  materials.push(material);
                }
              }
            });

            materials.forEach((material) => {
              group.addMaterialValue({
                material,
                propertyName: renameMaterialProperty(materialValue.propertyName!),
                targetValue: materialValue.targetValue!,
              });
            });
          });
        }

        blendShape.registerBlendShapeGroup(name, presetName, group);
      }),
    );

    return blendShape;
  }
}