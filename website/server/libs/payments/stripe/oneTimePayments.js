import payments from '../payments'; // eslint-disable-line import/no-cycle
import {
  BadRequest,
  NotAuthorized,
  NotFound,
} from '../../errors';
import stripeConstants from './constants';
import shared from '../../../../common';
import { getGemsBlock } from '../gems'; // eslint-disable-line import/no-cycle
import { model as User } from '../../../models/user'; // eslint-disable-line import/no-cycle

function getGiftAmount (gift) {
  if (gift.type === 'subscription') {
    return `${shared.content.subscriptionBlocks[gift.subscription.key].price * 100}`;
  }

  if (gift.gems.amount <= 0) {
    throw new BadRequest(shared.i18n.t('badAmountOfGemsToPurchase'));
  }

  return `${(gift.gems.amount / 4) * 100}`;
}

export async function getOneTimePaymentInfo (gemsBlockKey, gift, user) {
  let receiver = user;

  if (gift) {
    const member = await User.findById(gift.uuid).exec();
    if (!member) {
      throw new NotFound(shared.i18n.t(
        'userWithIDNotFound', { userId: gift.uuid }, user.preferences.language,
      ));
    }
    receiver = member;
  }

  let amount;
  let gemsBlock = null;

  if (gift) {
    amount = getGiftAmount(gift);
  } else {
    gemsBlock = getGemsBlock(gemsBlockKey);
    amount = gemsBlock.price;
  }

  if (!gift || gift.type === 'gems') {
    const receiverCanGetGems = await receiver.canGetGems();
    if (!receiverCanGetGems) throw new NotAuthorized(shared.i18n.t('groupPolicyCannotGetGems', receiver.preferences.language));
  }

  return {
    amount,
    gemsBlock,
  };
}

export async function applyGemPayment (session) {
  const { metadata } = session;
  const { gemsBlock, gift } = metadata;

  const user = await User.findById(metadata.userId).exec();
  if (!user) throw new NotFound(`User ${metadata.userId} not found.`);

  let method = 'buyGems';
  const data = {
    user,
    customerId: session.customer,
    paymentMethod: stripeConstants.PAYMENT_METHOD,
    gemsBlock,
    gift,
  };

  if (gift) {
    if (gift.type === 'subscription') method = 'createSubscription';
    data.paymentMethod = 'Gift';

    const member = await User.findById(gift.uuid).exec();
    if (!member) {
      throw new NotFound(shared.i18n.t(
        'userWithIDNotFound', { userId: gift.uuid }, user.preferences.language,
      ));
    }
    gift.member = member;
  }

  await payments[method](data);
}
