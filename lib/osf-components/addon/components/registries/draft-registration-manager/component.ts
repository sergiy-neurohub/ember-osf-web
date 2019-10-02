import { tagName } from '@ember-decorators/component';
import { computed } from '@ember-decorators/object';
import { alias } from '@ember-decorators/object/computed';
import Component from '@ember/component';
import { assert } from '@ember/debug';
import { ChangesetDef } from 'ember-changeset/types';
import { task, TaskInstance, timeout } from 'ember-concurrency';

import { layout, requiredAction } from 'ember-osf-web/decorators/component';
import DraftRegistration from 'ember-osf-web/models/draft-registration';
import RegistrationSchema from 'ember-osf-web/models/registration-schema';
import SchemaBlock from 'ember-osf-web/models/schema-block';

import { getPages, PageManager, PageResponse } from 'ember-osf-web/packages/registration-schema';
import { getPageParam } from 'ember-osf-web/utils/page-param';
import template from './template';

export interface DraftRegistrationManager {
    isValid: boolean;
    currentPageManager: PageManager;
    pageManagers: PageManager[];
    currentPage: number;

    onInput(): void;
    submitDraftRegistration(): void;
}

@tagName('')
@layout(template)
export default class DraftRegistrationManagerComponent extends Component.extend({
    initializePageManagers: task(function *(this: DraftRegistrationManagerComponent) {
        assert('TaskInstance<DraftRegistration> is required!', Boolean(this.modelTaskInstance));

        const draftRegistration = yield this.modelTaskInstance;
        this.setProperties({ draftRegistration });

        const registrationSchema = yield this.draftRegistration.registrationSchema;
        const blocks: SchemaBlock[] = yield registrationSchema.loadAll('schemaBlocks');
        const pages = getPages(blocks);
        const { registrationResponses } = this.draftRegistration;

        this.setProperties({
            lastPage: pages.length,
            registrationResponses,
        });

        const pageManagers = pages.map(
            pageSchemaBlocks => new PageManager(
                pageSchemaBlocks,
                this.registrationResponses,
            ),
        );

        if (pageManagers.length) {
            this.updateRoute(pageManagers[0].pageHeadingText as string);
        }

        this.setProperties({ pageManagers });
    }).on('init'),

    onInput: task(function *(this: DraftRegistrationManagerComponent) {
        yield timeout(500); // debounce

        if (this.currentPageManager && this.currentPageManager.schemaBlockGroups) {
            const changeset = this.currentPageManager.changeSet! as ChangesetDef;
            this.currentPageManager.schemaBlockGroups.forEach(({ registrationResponseKey }) => {
                Object.assign(
                    this.registrationResponses,
                    { registrationResponseKey: changeset.get(registrationResponseKey!) },
                );
            });

            const { registrationResponses } = this;
            this.draftRegistration.setProperties({ registrationResponses });

            yield this.draftRegistration.save();
        }
    }),

    submitDraftRegistration: task(function *(this: DraftRegistrationManagerComponent) {
        yield this.draftRegistration.save();
    }),

}) {
    // Required
    modelTaskInstance!: TaskInstance<DraftRegistration>;
    @requiredAction updateRoute!: (headingText: string) => void;

    // Private
    registrationSchema!: RegistrationSchema;
    draftRegistration!: DraftRegistration;
    currentPage!: number;
    lastPage!: number;
    registrationResponses: PageResponse = {};

    pageManagers: PageManager[] = [];

    @alias('onInput') autoSaving!: boolean;

    @computed('currentPage', 'pageManagers.[]')
    get nextPageParam() {
        if (this.pageManagers.length && (this.lastPage !== this.currentPage)) {
            const { pageHeadingText } = this.pageManagers[this.currentPage];
            return getPageParam(this.currentPage + 1, pageHeadingText);
        }
        return '';
    }

    @computed('currentPage', 'pageManagers.[]')
    get prevPageParam() {
        if (this.pageManagers.length && (this.currentPage > 1)) {
            const pageIndex = this.currentPage - 2;
            const { pageHeadingText } = this.pageManagers[pageIndex];
            return getPageParam(this.currentPage - 1, pageHeadingText);
        }
        return '';
    }

    @computed('currentPage', 'pageManagers.[]')
    get currentPageManager() {
        if (this.pageManagers.length >= this.currentPage) {
            return this.pageManagers[this.currentPage - 1];
        }
        return undefined;
    }

    @computed('pageManagers.{[],@each.pageIsValid}')
    get isValid() {
        return this.pageManagers.every(pageManager => Boolean(pageManager.pageIsValid));
    }
}
