const { commentIfDeactivated } = require('./commentIfDeactivated');

module.exports = app => {
	const _ = app.require('lodash');
	const { assignTemplates } = app.require('@hackolade/ddl-fe-utils');
	const { checkAllKeysDeactivated, divideIntoActivatedAndDeactivated, clean } =
		app.require('@hackolade/ddl-fe-utils').general;
	const { getRelationOptionsIndex } = require('./indexHelper')(app);
	const { trimBraces } = require('./general')(app);

	const createKeyConstraint = (templates, terminator, isParentActivated) => keyData => {
		const isAllColumnsDeactivated = checkAllKeysDeactivated(keyData.columns || []);
		const columns = getKeyColumns(isAllColumnsDeactivated, isParentActivated, keyData.columns);

		if (!keyDataHasOptions(keyData)) {
			return {
				statement: assignTemplates(templates.createKeyConstraint, {
					constraintName: keyData.name ? `CONSTRAINT [${keyData.name}] ` : '',
					keyType: keyData.keyType,
					clustered: '',
					columns: '',
					options: '',
					partition: '',
					terminator: '',
				}),
				isActivated: !isAllColumnsDeactivated,
			};
		}

		const indexOptions = getRelationOptionsIndex(adaptIndexOptions(keyData.indexOption));
		const partition = keyData.partition ? ` ON [${keyData.partition}]` : '';

		return {
			statement: assignTemplates(templates.createKeyConstraint, {
				constraintName: keyData.name ? `CONSTRAINT [${keyData.name}] ` : '',
				keyType: keyData.keyType,
				clustered: keyData.clustered ? ' CLUSTERED' : ' NONCLUSTERED',
				columns,
				options: indexOptions.length ? ' WITH (\n\t\t' + indexOptions.join(',\n\t\t') + '\n\t)' : '',
				partition,
				terminator,
			}),
			isActivated: !isAllColumnsDeactivated,
		};
	};

	const keyDataHasOptions = keyData => {
		const indexOption = clean(keyData.indexOption);

		if (!_.isEmpty(indexOption)) {
			return true;
		}

		const cleaned = clean(_.omit(keyData, 'keyType', 'indexOption', 'columns'));

		return !_.isEmpty(cleaned) || keyData.columns?.length > 1;
	};

	const adaptIndexOptions = indexOption => {
		return {
			...indexOption,
			allowRowLocks: Boolean(indexOption.allowRowLocks),
			allowPageLocks: Boolean(indexOption.allowPageLocks),
		};
	};

	const createDefaultConstraint = (templates, terminator) => (constraintData, tableName) => {
		return assignTemplates(templates.createDefaultConstraint, {
			tableName,
			constraintName: constraintData.constraintName,
			columnName: constraintData.columnName,
			default: trimBraces(constraintData.value),
			terminator,
		});
	};

	const generateConstraintsString = (dividedConstraints, isParentActivated) => {
		const deactivatedItemsAsString = commentIfDeactivated(
			dividedConstraints.deactivatedItems.join(',\n\t'),
			{ isActivated: !isParentActivated },
			true,
		);
		const activatedConstraints = dividedConstraints.activatedItems.length
			? ',\n\t' + dividedConstraints.activatedItems.join(',\n\t')
			: '';

		const deactivatedConstraints = dividedConstraints.deactivatedItems.length
			? '\n\t' + deactivatedItemsAsString
			: '';

		return activatedConstraints + deactivatedConstraints;
	};

	const getKeyColumns = (isAllColumnsDeactivated, isParentActivated, columns) => {
		if (!columns || columns.length === 0) {
			return '';
		}

		const columnMapToString = ({ name, order }) => `[${name}] ${order}`.trim();
		const dividedColumns = divideIntoActivatedAndDeactivated(columns, columnMapToString);
		const deactivatedColumnsAsString = dividedColumns?.deactivatedItems?.length
			? commentIfDeactivated(dividedColumns.deactivatedItems.join(', '), {
					isActivated: false,
					isPartOfLine: true,
			  })
			: '';

		return !isAllColumnsDeactivated && isParentActivated
			? ' (' + dividedColumns.activatedItems.join(', ') + deactivatedColumnsAsString + ')'
			: ' (' + columns.map(columnMapToString).join(', ') + ')';
	};

	return {
		createDefaultConstraint,
		createKeyConstraint,
		generateConstraintsString,
	};
};
