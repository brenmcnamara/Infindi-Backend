
const AccountLinkMutator = {
  genDelete: jest.fn(),
  genDeleteCollection: jest.fn(),
  genSet: jest.fn(),
  genSetCollection: jest.fn(),
};

AccountLinkMutator.genDelete.mockReturnValue(Promise.resolve());
AccountLinkMutator.genDeleteCollection.mockReturnValue(Promise.resolve());
AccountLinkMutator.genSet.mockReturnValue(Promise.resolve());
AccountLinkMutator.genSetCollection.mockReturnValue(Promise.resolve());

export default AccountLinkMutator;
