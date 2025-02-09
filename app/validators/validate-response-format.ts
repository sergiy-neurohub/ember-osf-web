import { isEmpty } from '@ember/utils';
import { ValidatorFunction } from 'ember-changeset-validations';
import File from 'ember-osf-web/models/file';
import NodeModel from 'ember-osf-web/models/node';
import { allSettled } from 'rsvp';

export function validateFileList(node?: NodeModel): ValidatorFunction {
    return async (_: string, newValue: File[]) => {
        if (newValue && node) {
            await allSettled(newValue.map(file => file.reload()));

            const detachedFiles = [];
            const deletedFiles = [];

            for (const file of newValue) {
                if (file.isError) {
                    deletedFiles.push(file.name);
                } else if (file.belongsTo('target').id() !== node.id) {
                    detachedFiles.push(file.name);
                }
            }
            const projectOrComponent = node.isRoot ? 'project' : 'component';
            const validationErrors: string[] = [];

            if (!isEmpty(detachedFiles)) {
                validationErrors.push(`File(s) "${detachedFiles.join(', ')}" no longer belong to this \
${projectOrComponent} or any of its registered components.`);
            }

            if (!isEmpty(deletedFiles)) {
                validationErrors.push(
                    `File(s) "${deletedFiles.join(', ')}" were deleted from this ${projectOrComponent}.`,
                );
            }
            return isEmpty(validationErrors) ? true : validationErrors;
        }
        return true;
    };
}
